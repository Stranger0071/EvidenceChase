import type { PrismaClient } from '@prisma/client';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { pinoHttp } from 'pino-http';
import { createStorage } from './adapters/storage';
import type { Env } from './config/env';
import type { Logger } from './lib/logger';
import { createSessionMiddleware } from './lib/session';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler';
import { originCheck } from './middleware/originCheck';
import { createRateLimits } from './middleware/rateLimits';
import type { MailerPort } from './ports/mailer';
import type { StoragePort } from './ports/storage';
import { createRepositories } from './repositories';
import { createAuditsRouter } from './routes/audits';
import { createAuthRouter } from './routes/auth';
import { createHealthRouter } from './routes/health';
import { createInternalRouter } from './routes/internal';
import { createOwnerRouter } from './routes/owner';
import { createRequestsRouter } from './routes/requests';
import { createFilesRouter, createReviewRouter } from './routes/review';
import { createAuditService, type Clock } from './services/auditService';
import { createAuthService } from './services/authService';
import { createNotificationService } from './services/notificationService';
import { createOwnerService } from './services/ownerService';
import { createRequestService } from './services/requestService';
import { createReviewService } from './services/reviewService';
import { createScanService } from './services/scanService';
import { createTokenService } from './services/tokenService';

export interface AppDeps {
  env: Env;
  prisma: PrismaClient;
  /** pg pool for the session store. */
  pool: Pool;
  logger: Logger;
  mailer: MailerPort;
  /** Defaults to S3 (or MinIO) from the environment. Tests inject an in-memory store. */
  storage?: StoragePort;
  clock?: Clock;
  /** Lower in tests: bcrypt at cost 12 is deliberately slow. */
  bcryptCost?: number;
  /** How long a submit waits for the malware scan. Zero in tests. */
  scanSettle?: { timeoutMs: number; intervalMs: number };
}

/**
 * Composition root: wires repositories → services → routes. Building the app from injected
 * dependencies (instead of module-level singletons) lets tests create a fresh app per suite.
 */
export function createApp(deps: AppDeps): Express {
  const { env, prisma, logger, clock } = deps;
  const isProduction = env.NODE_ENV === 'production';
  const storage = deps.storage ?? createStorage(env);
  const rateLimits = createRateLimits();

  const repositories = createRepositories(prisma);
  const tokenService = createTokenService(repositories, env, logger, clock);
  const notifications = createNotificationService(deps.mailer, tokenService, env, logger);
  const scanService = createScanService(
    repositories,
    storage,
    notifications,
    env,
    logger,
    clock,
    deps.scanSettle,
  );
  const auditService = createAuditService(repositories, clock);
  const requestService = createRequestService(
    repositories,
    auditService,
    { tokens: tokenService, notifications },
    clock,
  );
  const authService = createAuthService(repositories, { bcryptCost: deps.bcryptCost });
  const ownerService = createOwnerService(
    repositories,
    storage,
    scanService,
    notifications,
    logger,
    clock,
  );
  const reviewService = createReviewService(
    repositories,
    storage,
    scanService,
    notifications,
    clock,
  );

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

  // These routes don't use the session cookie, so they come before sessions and the origin check:
  // Render's health check, cron-job.org (bearer secret) and owners (magic-link token header).
  app.use(createHealthRouter(prisma, logger));
  app.use(
    '/internal/cron',
    createInternalRouter({ scanService, cronSecret: env.CRON_SECRET, logger }),
  );
  app.use('/e', createOwnerRouter({ ownerService, tokenService, rateLimit: rateLimits.owner }));

  app.use(
    createSessionMiddleware({
      pool: deps.pool,
      secret: env.SESSION_SECRET,
      secure: isProduction,
      pruneExpired: env.NODE_ENV !== 'test',
    }),
  );
  app.use(originCheck(env.WEB_ORIGIN));

  app.use('/auth', createAuthRouter({ authService, rateLimits, secureCookies: isProduction }));
  app.use('/audits', createAuditsRouter(auditService));
  app.use('/audits/:auditId/requests', createRequestsRouter(requestService));
  app.use('/requests', createReviewRouter(reviewService));
  app.use('/files', createFilesRouter(reviewService));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
