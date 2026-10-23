import {
  toIsoDate,
  type AuditDto,
  type AuditSummary,
  type EvidenceRequestDto,
  type UserDto,
} from '@evidencechase/shared';
import type { Audit, User } from '@prisma/client';
import { isOverdue } from '../domain/overdue';
import type { RequestWithCounts } from '../repositories/requestRepository';

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
