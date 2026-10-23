import {
  extensionOf,
  todayIsoDate,
  toIsoDate,
  type OwnerPortalDto,
  type PreparedUploadDto,
  type SubmissionDto,
  type SubmitEvidenceData,
  type UploadBatchItem,
} from '@evidencechase/shared';
import { fileTypeFromBuffer } from 'file-type';
import { randomUUID } from 'node:crypto';
import { checkDeclaredFile, checkDetectedType, isTextExtension } from '../domain/fileValidation';
import { isOverdue } from '../domain/overdue';
import { transition } from '../domain/requestStatus';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { inspectObject } from '../lib/inspectObject';
import type { Logger } from '../lib/logger';
import type { StoragePort } from '../ports/storage';
import type { Repositories } from '../repositories';
import type { TokenWithRequest } from '../repositories/tokenRepository';
import type { Clock } from './auditService';
import { toSubmissionDto } from './mappers';
import type { NotificationService } from './notificationService';
import type { ScanService } from './scanService';

const UPLOAD_LINK_SECONDS = 5 * 60;

type InspectResult =
  { ok: true; sha256: string; detectedMime: string | null } | { ok: false; problem: string };

export interface FileProblem {
  name: string;
  reason: string;
}

/** `details` of a 422 when files are refused, so the portal can show a reason next to each one. */
function filesRefused(problems: FileProblem[]): ValidationError {
  const message =
    problems.length === 1
      ? `"${problems[0]!.name}" can't be accepted: ${problems[0]!.reason}`
      : `${problems.length} files can't be accepted`;
  return new ValidationError(message, { files: problems }, 'FILES_REJECTED');
}

/**
 * Everything a control owner can do through their magic link (PRD §5 Flow B): see the request,
 * get upload links, and submit. The token has already been validated by middleware; this
 * enforces what that request allows right now.
 */
export function createOwnerService(
  repos: Repositories,
  storage: StoragePort,
  scanService: ScanService,
  notifications: NotificationService,
  logger: Logger,
  clock: Clock = () => new Date(),
) {
  const { files, submissions, activity } = repos;

  /** Owners can submit while evidence is still needed, unless the audit has been archived. */
  function assertCanSubmit({ request }: TokenWithRequest): void {
    if (request.audit.archivedAt) {
      throw new ConflictError(
        'This audit has been closed, so no more evidence is needed.',
        'AUDIT_ARCHIVED',
      );
    }
    if (request.status === 'ACCEPTED') {
      throw new ConflictError(
        'This evidence has already been accepted. Nothing more is needed.',
        'ALREADY_ACCEPTED',
      );
    }
    transition(request.status, 'SUBMIT', 'OWNER');
  }

  /** Downloads and checks one uploaded file. Returns its details, or why it was refused. */
  async function inspectUpload(file: {
    storageKey: string;
    originalName: string;
    sizeBytes: number;
  }): Promise<InspectResult> {
    const head = await storage.head(file.storageKey);
    if (!head) return { ok: false, problem: "the upload didn't finish, so please add it again" };

    const extension = extensionOf(file.originalName) ?? '';
    const inspected = await inspectObject(await storage.getStream(file.storageKey), {
      checkUtf8: isTextExtension(extension),
    });
    if (inspected.sizeBytes !== file.sizeBytes) {
      return {
        ok: false,
        problem: "the uploaded file doesn't match the one you chose, so please add it again",
      };
    }

    const detectedMime = (await fileTypeFromBuffer(inspected.head))?.mime ?? null;
    const problem =
      checkDetectedType(extension, detectedMime) ??
      (inspected.validUtf8 === false ? "it isn't plain text (UTF-8)" : null);
    return problem ? { ok: false, problem } : { ok: true, sha256: inspected.sha256, detectedMime };
  }

  return {
    async getPortal(token: TokenWithRequest): Promise<OwnerPortalDto> {
      const { request } = token;
      const [current, changesComment] = await Promise.all([
        submissions.findCurrentForRequest(request.id),
        request.status === 'CHANGES_REQUESTED' ? activity.latestChangesComment(request.id) : null,
      ]);
      const dueDate = toIsoDate(request.dueDate);

      return {
        request: {
          id: request.id,
          controlRef: request.controlRef,
          title: request.title,
          instructions: request.instructions,
          ownerName: request.ownerName,
          dueDate,
          status: request.status,
          isOverdue: isOverdue({ status: request.status, dueDate }, todayIsoDate(clock())),
          version: request.version,
        },
        auditName: request.audit.name,
        canSubmit: !request.audit.archivedAt && request.status !== 'ACCEPTED',
        changesComment,
        currentSubmission: current ? toSubmissionDto(current) : null,
      };
    },

    /**
     * Checks what the browser says each file is, registers it as PENDING_UPLOAD, and returns
     * presigned S3 POSTs pinned to that exact key, type and size (PRD §8.4, step 1).
     */
    async prepareUploads(
      token: TokenWithRequest,
      batch: UploadBatchItem[],
    ): Promise<PreparedUploadDto[]> {
      assertCanSubmit(token);

      const problems = batch.flatMap((item) => {
        const reason = checkDeclaredFile(item);
        return reason ? [{ name: item.name, reason }] : [];
      });
      if (problems.length > 0) throw filesRefused(problems);

      const requestId = token.request.id;
      const prepared = await Promise.all(
        batch.map(async (item) => {
          const id = randomUUID();
          const storageKey = `quarantine/${requestId}/${id}`;
          const upload = await storage.presignPost({
            key: storageKey,
            contentType: item.type,
            minBytes: item.size,
            maxBytes: item.size,
            expiresInSeconds: UPLOAD_LINK_SECONDS,
          });
          return { item, id, storageKey, upload };
        }),
      );

      await files.createMany(
        prepared.map(({ item, id, storageKey }) => ({
          id,
          requestId,
          storageKey,
          originalName: item.name,
          declaredMime: item.type,
          sizeBytes: item.size,
        })),
      );
      return prepared.map(({ item, id, upload }) => ({
        fileId: id,
        originalName: item.name,
        upload,
      }));
    },

    /**
     * Checks the uploaded bytes and records the submission (PRD §8.4, steps 3–4). Files that fail
     * are deleted and reported one by one; the rest stay uploaded so the owner can submit them
     * without uploading again.
     */
    async submit(
      token: TokenWithRequest,
      input: SubmitEvidenceData,
      meta: { ip?: string; userAgent?: string },
    ): Promise<SubmissionDto> {
      assertCanSubmit(token);
      const { request } = token;

      const found = await files.findForRequest(input.fileIds, request.id);
      if (found.length !== input.fileIds.length) throw new NotFoundError('Uploaded file');
      if (found.some((file) => file.state !== 'PENDING_UPLOAD')) {
        throw new ConflictError(
          'One of these files was already submitted',
          'FILE_ALREADY_SUBMITTED',
        );
      }

      const accepted: Array<{ id: string; sha256: string; detectedMime: string | null }> = [];
      const problems: FileProblem[] = [];
      for (const file of found) {
        const result = await inspectUpload(file);
        if (!result.ok) {
          problems.push({ name: file.originalName, reason: result.problem });
          await storage.delete(file.storageKey).catch((error: unknown) => {
            logger.warn({ err: error, fileId: file.id }, 'Could not delete refused upload');
          });
          await files.reject(file.id, { reason: result.problem, fromState: 'PENDING_UPLOAD' });
        } else {
          accepted.push({ id: file.id, sha256: result.sha256, detectedMime: result.detectedMime });
        }
      }
      if (problems.length > 0) throw filesRefused(problems);

      await submissions.createWithStatusChange({
        requestId: request.id,
        expectedVersion: input.version,
        toStatus: transition(request.status, 'SUBMIT', 'OWNER'),
        note: input.note,
        files: accepted,
        activity: {
          actorType: 'OWNER',
          actorEmail: request.ownerEmail,
          action: 'SUBMITTED',
          fromStatus: request.status,
          comment: input.note,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      });

      // Promote now if possible; anything still scanning is finished by the scan-check job.
      await scanService.settleAfterSubmit(request.id);
      await notifications.evidenceSubmitted(
        request,
        request.audit.name,
        request.audit.owner.email,
        accepted.length,
      );

      const current = await submissions.findCurrentForRequest(request.id);
      return toSubmissionDto(current!);
    },
  };
}

export type OwnerService = ReturnType<typeof createOwnerService>;
