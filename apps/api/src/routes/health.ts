import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import type { Logger } from '../lib/logger';

/**
 * Liveness and database check, used by Render's health check and the keep-alive ping.
 * It also logs the client IP Express sees, to confirm the `trust proxy` setting (Phase 0).
 */
export function createHealthRouter(prisma: PrismaClient, logger: Logger): Router {
  const router = Router();

  router.get('/health', async (req, res) => {
    logger.debug({ ip: req.ip, forwardedFor: req.get('x-forwarded-for') }, 'Health check');
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, db: 'up' });
    } catch (error) {
      logger.error({ err: error }, 'Health check: database unreachable');
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  return router;
}
