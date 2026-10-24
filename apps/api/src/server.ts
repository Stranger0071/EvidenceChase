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
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  // Requests still running after 10 seconds are cut off rather than blocking the redeploy.
  const forceExit = setTimeout(() => {
    logger.warn('Shutdown timed out; exiting with requests still open');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    await Promise.allSettled([prisma.$disconnect(), pool.end()]);
    logger.info('Shutdown complete');
    process.exit(0);
  });
  // Idle keep-alive connections (the proxy keeps some open) would otherwise hold close() open
  // until the timeout. Busy connections are left to finish their request.
  server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
