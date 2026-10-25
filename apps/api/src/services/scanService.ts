import type { Env } from '../config/env';
import { transition } from '../domain/requestStatus';
import { decideScanOutcome, type ScanDecision } from '../domain/scanOutcome';
import { ConflictError } from '../errors';
import { inspectObject } from '../lib/inspectObject';
import type { Logger } from '../lib/logger';
import { isPreconditionFailed, type StoragePort } from '../ports/storage';
import type { Repositories } from '../repositories';
import type { FileForScan } from '../repositories/fileRepository';
import type { Clock } from './auditService';
import type { NotificationService } from './notificationService';

const BATCH_SIZE = 50;

const CHANGED_AFTER_CHECK = {
  kind: 'reject',
  scanStatus: 'FAILED',
  reason: 'the file was replaced after it was checked, so please upload it again',
} as const satisfies ScanDecision;
/** Upload links last 5 minutes, so a file still waiting for upload after a day was abandoned. */
const ABANDONED_UPLOAD_HOURS = 24;

export type ScanResult = 'promoted' | 'rejected' | 'waiting' | 'error';

export interface ScanRunSummary {
  promoted: number;
  rejected: number;
  waiting: number;
  errors: number;
  retentionApplied: number;
  abandonedRejected: number;
}

/** Where a verified file lives for good. Fixed by IDs, so repeating a promotion is harmless. */
export function evidenceKeyFor(file: {
  id: string;
  requestId: string;
  submissionId: string;
  auditId: string;
}) {
  return `evidence/${file.auditId}/${file.requestId}/${file.submissionId}/${file.id}`;
}

/**
 * Moves submitted files out of quarantine (PRD §8.4, steps 5–6). A file is promoted only after
 * GuardDuty tags it clean (or straight away when scanning is off). Everything else is deleted and
 * the request goes back to the owner. Each step checks the file's current state first, so a crash
 * or two overlapping runs can never promote or reject a file twice: the next run just finishes
 * the job.
 */
export function createScanService(
  repos: Repositories,
  storage: StoragePort,
  notifications: NotificationService,
  env: Env,
  logger: Logger,
  clock: Clock = () => new Date(),
  /** How long a submit waits for GuardDuty before leaving the rest to the scan-check job. */
  settle = { timeoutMs: 10_000, intervalMs: 1_000 },
) {
  const { files, requests, activity } = repos;

  async function applyRetention(fileId: string, storageKey: string): Promise<boolean> {
    const retainUntil = new Date(
      clock().getTime() + env.OBJECT_LOCK_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    try {
      await storage.putRetention(storageKey, retainUntil);
      await files.setRetention(fileId, retainUntil);
      return true;
    } catch (error) {
      // Left with retainUntil = null, so the next scan-check run tries again.
      logger.warn({ err: error, fileId }, 'Could not apply Object Lock retention; will retry');
      return false;
    }
  }

  /**
   * Whether the quarantined object still holds the exact bytes that were checked at submit. The
   * owner's upload link stays valid for a few minutes after it's issued, so it could have been
   * used again to swap in different bytes (say, a program in place of a checked PDF).
   */
  async function unchangedSinceSubmit(file: FileForScan, etag: string | undefined) {
    if (!file.sha256) return false;
    try {
      const stream = await storage.getStream(file.storageKey, { ifMatch: etag });
      const { sha256 } = await inspectObject(stream, { checkUtf8: false });
      return sha256 === file.sha256;
    } catch (error) {
      if (isPreconditionFailed(error)) return false;
      throw error;
    }
  }

  /** Copies only the version that was just re-checked (`etag`), so nothing can slip in between. */
  async function promote(
    file: FileForScan & { submissionId: string },
    scanStatus: 'NO_THREATS_FOUND' | 'NOT_SCANNED',
    etag: string | undefined,
  ): Promise<'promoted' | 'changed'> {
    const evidenceKey = evidenceKeyFor({ ...file, auditId: file.request.auditId });
    try {
      await storage.copy(file.storageKey, evidenceKey, { ifMatch: etag });
    } catch (error) {
      if (isPreconditionFailed(error)) return 'changed';
      throw error;
    }
    const verified = await files.markVerified(file.id, {
      storageKey: evidenceKey,
      scanStatus,
      verifiedAt: clock(),
    });
    if (!verified) return 'promoted'; // Another run promoted it first.

    await applyRetention(file.id, evidenceKey);
    // The quarantine lifecycle rule removes it anyway after a day; this just tidies up sooner.
    await storage.delete(file.storageKey).catch((error: unknown) => {
      logger.warn({ err: error, fileId: file.id }, 'Could not delete quarantine copy');
    });
    return 'promoted';
  }

  async function reject(file: FileForScan, decision: Extract<ScanDecision, { kind: 'reject' }>) {
    await storage.delete(file.storageKey).catch((error: unknown) => {
      logger.warn({ err: error, fileId: file.id }, 'Could not delete rejected file');
    });
    const rejected = await files.reject(file.id, {
      reason: decision.reason,
      scanStatus: decision.scanStatus,
      fromState: 'AWAITING_SCAN',
    });
    if (!rejected) return;

    const comment = `"${file.originalName}" wasn't accepted: ${decision.reason}.`;
    const { request } = file;
    // Only a file in the evidence currently under review sends the request back to the owner.
    if (file.submission?.isCurrent && request.status === 'SUBMITTED') {
      try {
        await requests.transitionStatus({
          requestId: request.id,
          expectedVersion: request.version,
          toStatus: transition(request.status, 'SCAN_FAILED', 'SYSTEM'),
          activity: {
            actorType: 'SYSTEM',
            action: 'SCAN_FAILED',
            fromStatus: request.status,
            comment,
          },
        });
        await notifications.fileRejected(request, file.originalName, decision.reason);
        return;
      } catch (error) {
        // The request already moved on (e.g. another file in the same submission failed first).
        if (!(error instanceof ConflictError)) throw error;
      }
    }
    await activity.create({
      requestId: request.id,
      actorType: 'SYSTEM',
      action: 'FILE_REJECTED',
      comment,
    });
  }

  async function processFile(file: FileForScan): Promise<ScanResult> {
    if (!file.submissionId) return 'waiting';
    try {
      const waitingMinutes = (clock().getTime() - file.createdAt.getTime()) / 60_000;
      const exists = await storage.head(file.storageKey);
      const decision: ScanDecision = !exists
        ? {
            kind: 'reject',
            scanStatus: 'FAILED',
            reason: 'the upload could no longer be found, so please upload it again',
          }
        : decideScanOutcome({
            scanningEnabled: env.MALWARE_SCAN_ENABLED,
            tags: env.MALWARE_SCAN_ENABLED ? await storage.getTags(file.storageKey) : {},
            waitingMinutes,
          });

      if (decision.kind === 'wait') return 'waiting';
      if (decision.kind === 'reject') {
        await reject(file, decision);
        return 'rejected';
      }

      const etag = exists?.etag ?? undefined;
      const outcome = (await unchangedSinceSubmit(file, etag))
        ? await promote({ ...file, submissionId: file.submissionId }, decision.scanStatus, etag)
        : 'changed';
      if (outcome === 'changed') {
        logger.warn({ fileId: file.id }, 'Quarantined file changed after it was checked');
        await reject(file, CHANGED_AFTER_CHECK);
        return 'rejected';
      }
      return 'promoted';
    } catch (error) {
      // The file stays AWAITING_SCAN and is retried on the next run.
      logger.error({ err: error, fileId: file.id }, 'Scan check failed for file');
      return 'error';
    }
  }

  async function checkRequest(requestId: string): Promise<ScanResult[]> {
    const waiting = await files.listAwaitingScan({ requestId, limit: BATCH_SIZE });
    const results: ScanResult[] = [];
    // One at a time: each may change the request's status, and the next needs to see that.
    for (const file of waiting) results.push(await processFile(file));
    return results;
  }

  return {
    checkRequest,

    /**
     * Right after a submit, polls briefly so small files are often clean before the owner leaves
     * the page. Anything still scanning is picked up by the 5-minute scan-check job.
     */
    async settleAfterSubmit(requestId: string) {
      const deadline = Date.now() + settle.timeoutMs;
      for (;;) {
        const results = await checkRequest(requestId);
        if (!env.MALWARE_SCAN_ENABLED || !results.includes('waiting') || Date.now() >= deadline)
          return;
        await new Promise((resolve) => setTimeout(resolve, settle.intervalMs));
      }
    },

    /** The scan-check job, run every 5 minutes by cron-job.org. */
    async runPending(): Promise<ScanRunSummary> {
      const summary: ScanRunSummary = {
        promoted: 0,
        rejected: 0,
        waiting: 0,
        errors: 0,
        retentionApplied: 0,
        abandonedRejected: 0,
      };

      for (const file of await files.listAwaitingScan({ limit: BATCH_SIZE })) {
        const result = await processFile(file);
        summary[result === 'error' ? 'errors' : result] += 1;
      }
      for (const file of await files.listMissingRetention(BATCH_SIZE)) {
        if (await applyRetention(file.id, file.storageKey)) summary.retentionApplied += 1;
      }
      summary.abandonedRejected = await files.rejectAbandoned(
        new Date(clock().getTime() - ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000),
      );
      return summary;
    },
  };
}

export type ScanService = ReturnType<typeof createScanService>;
