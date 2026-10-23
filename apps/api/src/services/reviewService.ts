import {
  todayIsoDate,
  type ActivityLogDto,
  type EvidenceRequestDto,
  type FileUrlDto,
  type ReviewAction,
  type SubmissionDto,
} from '@evidencechase/shared';
import { transition } from '../domain/requestStatus';
import { ConflictError, NotFoundError } from '../errors';
import type { StoragePort } from '../ports/storage';
import type { Repositories } from '../repositories';
import { staleRequestError, type RequestWithAudit } from '../repositories/requestRepository';
import { assertNotArchived, type Clock } from './auditService';
import { contentTypeOf, toActivityDto, toFileDto, toRequestDto, toSubmissionDto } from './mappers';
import type { NotificationService } from './notificationService';
import type { ScanService } from './scanService';

const FILE_URL_SECONDS = 60;

export interface ReviewInput {
  action: ReviewAction;
  comment: string | null;
  /** The version the manager was looking at, for optimistic locking. */
  version: number;
}

/** Manager review of submitted evidence (PRD §5 Flow C, Phase 4). */
export function createReviewService(
  repos: Repositories,
  storage: StoragePort,
  scanService: ScanService,
  notifications: NotificationService,
  clock: Clock = () => new Date(),
) {
  const { requests, files, submissions, activity, users } = repos;

  /** Someone else's request gets the same 404 as a missing one. */
  async function getRequest(managerId: string, requestId: string): Promise<RequestWithAudit> {
    const request = await requests.findForManager(requestId, managerId);
    if (!request) throw new NotFoundError('Evidence request');
    return request;
  }

  return {
    async review(
      managerId: string,
      requestId: string,
      input: ReviewInput,
      meta: { ip?: string; userAgent?: string },
    ): Promise<EvidenceRequestDto> {
      const request = await getRequest(managerId, requestId);
      assertNotArchived(request.audit);
      // Fail fast with a clear message; the transaction re-checks it atomically.
      if (input.version !== request.version) throw staleRequestError();

      const toStatus = transition(request.status, input.action, 'MANAGER', input.comment);

      if (input.action === 'ACCEPT') {
        const current = await submissions.findCurrentForRequest(requestId);
        if (!current || current.files.length === 0) {
          throw new ConflictError('There is no evidence to accept yet', 'NO_EVIDENCE');
        }
        if (current.files.some((file) => file.state !== 'VERIFIED')) {
          throw new ConflictError(
            "Some files are still being checked for malware. You can accept once they're clear.",
            'FILES_NOT_VERIFIED',
          );
        }
      }

      const manager = await users.findById(managerId);
      const updated = await requests.transitionStatus({
        requestId,
        expectedVersion: input.version,
        toStatus,
        activity: {
          actorType: 'MANAGER',
          actorId: managerId,
          actorEmail: manager?.email ?? null,
          action: input.action,
          fromStatus: request.status,
          comment: input.comment,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      });

      if (toStatus === 'CHANGES_REQUESTED' && input.comment) {
        await notifications.changesRequested(request, input.comment);
      }
      return toRequestDto(updated, todayIsoDate(clock()));
    },

    /** Every submission, newest first. Opening a request also nudges any files still being scanned. */
    async listSubmissions(managerId: string, requestId: string): Promise<SubmissionDto[]> {
      await getRequest(managerId, requestId);
      await scanService.checkRequest(requestId);
      return (await submissions.listByRequest(requestId)).map(toSubmissionDto);
    },

    async timeline(managerId: string, requestId: string): Promise<ActivityLogDto[]> {
      await getRequest(managerId, requestId);
      return (await activity.listByRequest(requestId)).map(toActivityDto);
    },

    /**
     * A 60-second link to one file, straight from S3. Only verified (scanned, promoted) files
     * are served. Inline viewing is limited to images and PDFs; everything else is a download.
     */
    async fileUrl(managerId: string, fileId: string, wantInline: boolean): Promise<FileUrlDto> {
      const file = await files.findForManager(fileId, managerId);
      if (!file) throw new NotFoundError('File');
      if (file.state !== 'VERIFIED') {
        throw new ConflictError(
          "This file isn't available: it's still being checked or was rejected",
          'FILE_NOT_VERIFIED',
        );
      }

      const inline = wantInline && toFileDto(file).previewable;
      const url = await storage.presignGet({
        key: file.storageKey,
        filename: file.originalName,
        contentType: contentTypeOf(file),
        disposition: inline ? 'inline' : 'attachment',
        expiresInSeconds: FILE_URL_SECONDS,
      });

      const manager = await users.findById(managerId);
      await activity.create({
        requestId: file.requestId,
        actorType: 'MANAGER',
        actorId: managerId,
        actorEmail: manager?.email ?? null,
        action: inline ? 'PREVIEWED' : 'DOWNLOADED',
        comment: file.originalName,
      });
      return { url, expiresInSeconds: FILE_URL_SECONDS };
    },
  };
}

export type ReviewService = ReturnType<typeof createReviewService>;
