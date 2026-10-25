import {
  parseRequestsCsv,
  todayIsoDate,
  type CsvRowError,
  type EvidenceRequestDto,
  type MagicLinkDto,
  type RequestData,
  type RequestUpdateData,
  type SendAudience,
  type SendRequestsData,
  type SendRequestsResultDto,
} from '@evidencechase/shared';
import { OPEN_STATUSES } from '../domain/overdue';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { isUniqueViolation } from '../lib/prisma';
import type { Repositories } from '../repositories';
import type { RequestCreateData, RequestWithCounts } from '../repositories/requestRepository';
import { assertNotArchived, type AuditService, type Clock } from './auditService';
import { fromIsoDate, toRequestDto } from './mappers';
import type { NotificationService } from './notificationService';
import type { TokenService } from './tokenService';

const CSV_FIRST_DATA_ROW = 2;

/** Why a narrowed send matched nothing, when some evidence is still owed. */
const NOTHING_TO_SEND_MESSAGES: Record<SendAudience, string> = {
  all: 'Every request already has evidence submitted',
  overdue: 'No requests are overdue',
  changes_requested: 'No requests are waiting on changes',
  selected: 'None of the people chosen still owe evidence',
};

function duplicateControlRef(controlRef: string): ConflictError {
  return new ConflictError(
    `Control ID "${controlRef}" already exists in this audit`,
    'DUPLICATE_CONTROL_REF',
  );
}

function toCreateData(data: RequestData): RequestCreateData {
  return { ...data, dueDate: fromIsoDate(data.dueDate) };
}

export function createRequestService(
  { requests }: Repositories,
  auditService: AuditService,
  links: { tokens: TokenService; notifications: NotificationService },
  clock: Clock = () => new Date(),
) {
  const toDto = (request: RequestWithCounts) => toRequestDto(request, todayIsoDate(clock()));

  async function getEditableAudit(ownerId: string, auditId: string) {
    const audit = await auditService.getOwned(ownerId, auditId);
    assertNotArchived(audit);
    return audit;
  }

  async function getRequest(auditId: string, requestId: string): Promise<RequestWithCounts> {
    const request = await requests.findInAudit(requestId, auditId);
    if (!request) throw new NotFoundError('Evidence request');
    return request;
  }

  /** Control IDs are unique per audit, ignoring case ("CC6.1" and "cc6.1" are the same control). */
  async function assertControlRefFree(
    auditId: string,
    controlRef: string,
    exceptRequestId?: string,
  ) {
    const existing = await requests.listControlRefs(auditId);
    const clash = existing.find(
      (row) =>
        row.id !== exceptRequestId && row.controlRef.toLowerCase() === controlRef.toLowerCase(),
    );
    if (clash) throw duplicateControlRef(controlRef);
  }

  return {
    async list(ownerId: string, auditId: string): Promise<EvidenceRequestDto[]> {
      await auditService.getOwned(ownerId, auditId);
      const rows = await requests.listByAudit(auditId);
      return rows.map(toDto);
    },

    /**
     * Emails the owners in the chosen audience who still owe evidence: one email per owner,
     * listing their matching open requests with a fresh link each. Archived audits send nothing
     * (they're read-only).
     */
    async sendRequests(
      ownerId: string,
      auditId: string,
      { audience, ownerEmails }: SendRequestsData,
    ): Promise<SendRequestsResultDto> {
      const audit = await getEditableAudit(ownerId, auditId);
      const open = (await requests.listByAudit(auditId)).filter((request) =>
        OPEN_STATUSES.includes(request.status),
      );
      if (open.length === 0) {
        throw new ValidationError(
          'Every request already has evidence submitted',
          undefined,
          'NOTHING_TO_SEND',
        );
      }

      const chosen = new Set(ownerEmails.map((email) => email.toLowerCase()));
      const matching = open.filter((request) => {
        switch (audience) {
          case 'all':
            return true;
          case 'overdue':
            return toDto(request).isOverdue;
          case 'changes_requested':
            return request.status === 'CHANGES_REQUESTED';
          case 'selected':
            return chosen.has(request.ownerEmail.toLowerCase());
        }
      });
      if (matching.length === 0) {
        throw new ValidationError(NOTHING_TO_SEND_MESSAGES[audience], undefined, 'NOTHING_TO_SEND');
      }

      const result = await links.notifications.sendEvidenceRequests(audit.name, matching);
      return { ...result, requestsIncluded: matching.length };
    },

    /** A fresh magic link for one request, for the "Copy link" button (works without email). */
    async createLink(ownerId: string, auditId: string, requestId: string): Promise<MagicLinkDto> {
      await getEditableAudit(ownerId, auditId);
      await getRequest(auditId, requestId);
      const { url, expiresAt } = await links.tokens.issue(requestId);
      return { url, expiresAt: expiresAt.toISOString() };
    },

    async create(ownerId: string, auditId: string, data: RequestData): Promise<EvidenceRequestDto> {
      await getEditableAudit(ownerId, auditId);
      await assertControlRefFree(auditId, data.controlRef);
      try {
        return toDto(await requests.create(auditId, toCreateData(data)));
      } catch (error) {
        // A concurrent create can still win the race; the unique index is the final word.
        if (isUniqueViolation(error)) throw duplicateControlRef(data.controlRef);
        throw error;
      }
    },

    async update(
      ownerId: string,
      auditId: string,
      requestId: string,
      data: RequestUpdateData,
    ): Promise<EvidenceRequestDto> {
      await getEditableAudit(ownerId, auditId);
      const existing = await getRequest(auditId, requestId);

      if (data.controlRef !== undefined) {
        await assertControlRefFree(auditId, data.controlRef, requestId);
      }

      const { dueDate, ...rest } = data;
      const ownerChanged = data.ownerEmail !== undefined && data.ownerEmail !== existing.ownerEmail;
      try {
        const updated = await requests.update(
          requestId,
          { ...rest, ...(dueDate !== undefined && { dueDate: fromIsoDate(dueDate) }) },
          { revokeAccessTokens: ownerChanged },
        );
        return toDto(updated);
      } catch (error) {
        if (isUniqueViolation(error) && data.controlRef) throw duplicateControlRef(data.controlRef);
        throw error;
      }
    },

    /** Requests with submitted evidence are part of the audit trail, so they can't be deleted. */
    async remove(ownerId: string, auditId: string, requestId: string): Promise<void> {
      await getEditableAudit(ownerId, auditId);
      const existing = await getRequest(auditId, requestId);
      if (existing._count.submissions > 0) {
        throw new ConflictError(
          "This request already has evidence submitted, so it can't be deleted",
          'HAS_SUBMISSIONS',
        );
      }
      await requests.delete(requestId);
    },

    /**
     * All-or-nothing CSV import (FR-4). The raw text is parsed and validated here even though the
     * browser already previewed it, because the client is never trusted.
     */
    async importCsv(ownerId: string, auditId: string, csvText: string): Promise<number> {
      await getEditableAudit(ownerId, auditId);

      const parsed = parseRequestsCsv(csvText);
      if (!parsed.ok) {
        throw new ValidationError(
          'The CSV has errors. Nothing was imported.',
          { rows: parsed.errors },
          'CSV_INVALID',
        );
      }

      const taken = new Set(
        (await requests.listControlRefs(auditId)).map((row) => row.controlRef.toLowerCase()),
      );
      const clashes: CsvRowError[] = parsed.rows.flatMap((row, index) =>
        taken.has(row.controlRef.toLowerCase())
          ? [
              {
                row: index + CSV_FIRST_DATA_ROW,
                field: 'controlRef',
                message: `Control ID "${row.controlRef}" already exists in this audit`,
              },
            ]
          : [],
      );
      if (clashes.length > 0) {
        throw new ValidationError(
          'The CSV has errors. Nothing was imported.',
          { rows: clashes },
          'CSV_INVALID',
        );
      }

      try {
        return await requests.createMany(auditId, parsed.rows.map(toCreateData));
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            'Another change added one of these control IDs at the same time. Nothing was imported; try again.',
            'DUPLICATE_CONTROL_REF',
          );
        }
        throw error;
      }
    },
  };
}

export type RequestService = ReturnType<typeof createRequestService>;
