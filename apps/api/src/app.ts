import type { PrismaClient } from '@prisma/client';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env';
import type { Logger } from './lib/logger';
import { createSessionMiddleware } from './lib/session';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler';
import { originCheck } from './middleware/originCheck';
import { createRateLimits } from './middleware/rateLimits';
import type { MailerPort } from './ports/mailer';
import { createRepositories } from './repositories';
import { createAuditsRouter } from './routes/audits';
import { createAuthRouter } from './routes/auth';
import { createHealthRouter } from './routes/health';
import { createRequestsRouter } from './routes/requests';
import { createAuditService, type Clock } from './services/auditService';
import { createAuthService } from './services/authService';
import { createRequestService } from './services/requestService';

export interface AppDeps {
  env: Env;
  prisma: PrismaClient;
  /** pg pool for the session store. */
  pool: Pool;
  logger: Logger;
  mailer: MailerPort;
  clock?: Clock;
  /** Lower in tests: bcrypt at cost 12 is deliberately slow. */
  bcryptCost?: number;
}

/**
 * Composition root: wires repositories → services → routes. Building the app from injected
 * dependencies (instead of module-level singletons) lets tests create a fresh app per suite.
 */
export function createApp(deps: AppDeps): Express {
  const { env, prisma, logger } = deps;
  const isProduction = env.NODE_ENV === 'production';

  const repositories = createRepositories(prisma);
  const auditService = createAuditService(repositories, deps.clock);
  const requestService = createRequestService(repositories, auditService, deps.clock);
  const authService = createAuthService(repositories, { bcryptCost: deps.bcryptCost });

  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // The keep-alive ping hits /health every few minutes; don't flood the logs with it.
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  // Before sessions and the origin check: Render and the keep-alive ping call it without either.
  app.use(createHealthRouter(prisma, logger));

  app.use(
    createSessionMiddleware({
      pool: deps.pool,
      secret: env.SESSION_SECRET,
      secure: isProduction,
      pruneExpired: env.NODE_ENV !== 'test',
    }),
  );
  app.use(originCheck(env.WEB_ORIGIN));

  app.use(
    '/auth',
    createAuthRouter({ authService, rateLimits: createRateLimits(), secureCookies: isProduction }),
  );
  app.use('/audits', createAuditsRouter(auditService));
  app.use('/audits/:auditId/requests', createRequestsRouter(requestService));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
