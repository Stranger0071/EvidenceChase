import { Router } from 'express';
import type { Logger } from '../lib/logger';
import { requireCronSecret } from '../middleware/cronAuth';
import type { ScanService } from '../services/scanService';

/**
 * Scheduled jobs, called by cron-job.org. Each responds 202 straight away and runs in the
 * background: the scheduler gives up after about 30 seconds, and Render runs a long-lived
 * process, so work can carry on after the response. One run at a time per job; an overlapping
 * call is a no-op, since every job is idempotent anyway.
 */
export function createInternalRouter(deps: {
  scanService: ScanService;
  cronSecret?: string;
  logger: Logger;
}): Router {
  const { scanService, logger } = deps;
  const router = Router();
  router.use(requireCronSecret(deps.cronSecret));

  let scanRunning = false;

  /** Every 5 minutes: promotes or rejects scanned files. The call also keeps the free instance awake. */
  router.post('/scan-check', (_req, res) => {
    if (scanRunning) {
      res.status(202).json({ started: false, reason: 'already running' });
      return;
    }
    scanRunning = true;
    res.status(202).json({ started: true });

    scanService
      .runPending()
      .then((summary) => logger.info({ job: 'scan-check', ...summary }, 'Scan check finished'))
      .catch((error: unknown) =>
        logger.error({ err: error, job: 'scan-check' }, 'Scan check failed'),
      )
      .finally(() => {
        scanRunning = false;
      });
  });

  return router;
}
