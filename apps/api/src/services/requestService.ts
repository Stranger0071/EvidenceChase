import {
  parseRequestsCsv,
  todayIsoDate,
  type CsvRowError,
  type EvidenceRequestDto,
  type RequestData,
  type RequestUpdateData,
} from '@evidencechase/shared';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { isUniqueViolation } from '../lib/prisma';
import type { Repositories } from '../repositories';
import type { RequestCreateData, RequestWithCounts } from '../repositories/requestRepository';
import { assertNotArchived, type AuditService, type Clock } from './auditService';
import { fromIsoDate, toRequestDto } from './mappers';

const CSV_FIRST_DATA_ROW = 2;

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
