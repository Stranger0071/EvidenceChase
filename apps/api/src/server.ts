import pg from 'pg';
import { ConsoleMailer } from './adapters/mailer.console';
import { ResendMailer } from './adapters/mailer.resend';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createLogger } from './lib/logger';
import { createPrismaClient } from './lib/prisma';

const env = loadEnv();
const logger = createLogger(env);
const prisma = createPrismaClient(env.DATABASE_URL);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });

// Real email when Resend is configured; otherwise emails (and their magic links) go to the log.
const mailer = env.RESEND_API_KEY
  ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM)
  : new ConsoleMailer(logger);

const app = createApp({ env, prisma, pool, logger, mailer });

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'EvidenceChase API listening');
});

/**
 * Render sends SIGTERM before replacing the instance on a redeploy. Stop taking new connections,
 * let in-flight requests finish, then close the database connections.
 */
function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  server.close(async () => {
    await Promise.allSettled([prisma.$disconnect(), pool.end()]);
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
