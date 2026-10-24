import { Router, type RequestHandler } from 'express';
import type { Logger } from '../lib/logger';
import { requireCronSecret } from '../middleware/cronAuth';
import type { ReminderService } from '../services/reminderService';
import type { ScanService } from '../services/scanService';

/**
 * Scheduled jobs, called by cron-job.org. Each responds 202 straight away and runs in the
 * background: the scheduler gives up after about 30 seconds, and Render runs a long-lived
 * process, so work can carry on after the response. One run at a time per job; an overlapping
 * call is a no-op, since every job is idempotent anyway.
 */
export function createInternalRouter(deps: {
  scanService: ScanService;
  reminderService: ReminderService;
  cronSecret?: string;
  logger: Logger;
}): Router {
  const { logger } = deps;
  const router = Router();
  router.use(requireCronSecret(deps.cronSecret));

  function backgroundJob(name: string, run: () => Promise<object>): RequestHandler {
    let running = false;
    return (_req, res) => {
      if (running) {
        res.status(202).json({ started: false, reason: 'already running' });
        return;
      }
      running = true;
      res.status(202).json({ started: true });

      run()
        .then((summary) => logger.info({ job: name, ...summary }, `Job ${name} finished`))
        .catch((error: unknown) => logger.error({ err: error, job: name }, `Job ${name} failed`))
        .finally(() => {
          running = false;
        });
    };
  }

  /** Every 5 minutes: promotes or rejects scanned files. The call also keeps the free instance awake. */
  router.post(
    '/scan-check',
    backgroundJob('scan-check', () => deps.scanService.runPending()),
  );

  /** Daily at 09:00 IST: emails each owner one digest of the reminders due today. */
  router.post(
    '/reminders',
    backgroundJob('reminders', () => deps.reminderService.run()),
  );

  return router;
}
