import {
  PREVIEWABLE_CONTENT_TYPES,
  toIsoDate,
  type ActivityLogDto,
  type AuditDto,
  type AuditSummary,
  type EvidenceFileDto,
  type EvidenceRequestDto,
  type SubmissionDto,
  type UserDto,
} from '@evidencechase/shared';
import type { ActivityLog, Audit, EvidenceFile, User } from '@prisma/client';
import { isOverdue } from '../domain/overdue';
import type { RequestWithCounts } from '../repositories/requestRepository';
import type { SubmissionWithFiles } from '../repositories/submissionRepository';

/** Converts a YYYY-MM-DD string to the UTC-midnight Date that Postgres `DATE` columns use. */
export function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toUserDto(user: User): UserDto {
  return { id: user.id, email: user.email, name: user.name };
}

export function toAuditDto(audit: Audit, summary: AuditSummary): AuditDto {
  return {
    id: audit.id,
    name: audit.name,
    framework: audit.framework,
    auditDate: audit.auditDate ? toIsoDate(audit.auditDate) : null,
    remindersOn: audit.remindersOn,
    archivedAt: audit.archivedAt?.toISOString() ?? null,
    createdAt: audit.createdAt.toISOString(),
    updatedAt: audit.updatedAt.toISOString(),
    summary,
  };
}

export function toRequestDto(request: RequestWithCounts, today: string): EvidenceRequestDto {
  const dueDate = toIsoDate(request.dueDate);
  return {
    id: request.id,
    auditId: request.auditId,
    controlRef: request.controlRef,
    title: request.title,
    instructions: request.instructions,
    ownerName: request.ownerName,
    ownerEmail: request.ownerEmail,
    dueDate,
    status: request.status,
    isOverdue: isOverdue({ status: request.status, dueDate }, today),
    hasSubmissions: request._count.submissions > 0,
    version: request.version,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

/** The type a file really is (from its magic bytes), or what was declared if nothing was detected. */
export function contentTypeOf(file: EvidenceFile): string {
  return file.detectedMime ?? file.declaredMime;
}

/** Storage keys are internal, so they're left out of every DTO. */
export function toFileDto(file: EvidenceFile): EvidenceFileDto {
  const contentType = contentTypeOf(file);
  return {
    id: file.id,
    originalName: file.originalName,
    sizeBytes: file.sizeBytes,
    contentType,
    state: file.state,
    scanStatus: file.scanStatus,
    sha256: file.sha256,
    retainUntil: file.retainUntil?.toISOString() ?? null,
    rejectReason: file.rejectReason,
    createdAt: file.createdAt.toISOString(),
    verifiedAt: file.verifiedAt?.toISOString() ?? null,
    previewable: file.state === 'VERIFIED' && PREVIEWABLE_CONTENT_TYPES.includes(contentType),
  };
}

export function toSubmissionDto(submission: SubmissionWithFiles): SubmissionDto {
  return {
    id: submission.id,
    note: submission.note,
    submittedAt: submission.submittedAt.toISOString(),
    isCurrent: submission.isCurrent,
    files: submission.files.map(toFileDto),
  };
}

/** IP address and user agent stay in the database for investigations; they aren't shown in the UI. */
export function toActivityDto(entry: ActivityLog): ActivityLogDto {
  return {
    id: entry.id,
    actorType: entry.actorType,
    actorEmail: entry.actorEmail,
    action: entry.action,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    comment: entry.comment,
    createdAt: entry.createdAt.toISOString(),
  };
}
