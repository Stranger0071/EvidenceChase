import { Router, type RequestHandler, type Response } from 'express';
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
    // An empty 202 with an explicit zero length: schedulers (cron-job.org) only need the status, and
    // a bodiless response can't trip their response-size limits. Results go to the logs.
    const accepted = (res: Response) => res.status(202).set('Content-Length', '0').end();

    return (_req, res) => {
      if (running) {
        logger.info({ job: name }, `Job ${name} already running; skipped`);
        accepted(res);
        return;
      }
      running = true;
      logger.info({ job: name }, `Job ${name} started`);
      accepted(res);

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
