import {
  todayIsoDate,
  toIsoDate,
  type AuditDashboardDto,
  type AuditData,
  type AuditDto,
  type AuditUpdateData,
} from '@evidencechase/shared';
import type { Audit } from '@prisma/client';
import { daysBetween } from '../domain/reminderSchedule';
import { buildOwnerProgress } from '../domain/summary';
import { ConflictError, NotFoundError } from '../errors';
import type { Repositories } from '../repositories';
import { fromIsoDate, toAuditDto } from './mappers';

export type Clock = () => Date;

/** Archived audits are read-only (FR-1). */
export function assertNotArchived(audit: Audit): void {
  if (audit.archivedAt) {
    throw new ConflictError(
      'This audit is archived and can no longer be changed',
      'AUDIT_ARCHIVED',
    );
  }
}

export function createAuditService({ audits }: Repositories, clock: Clock = () => new Date()) {
  /** Loads an audit the manager owns. Someone else's audit gets the same 404 as a missing one. */
  async function getOwned(ownerId: string, auditId: string): Promise<Audit> {
    const audit = await audits.findOwned(auditId, ownerId);
    if (!audit) throw new NotFoundError('Audit');
    return audit;
  }

  async function toDtos(list: Audit[]): Promise<AuditDto[]> {
    if (list.length === 0) return [];
    const today = fromIsoDate(todayIsoDate(clock()));
    const summaries = await audits.summaries(
      list.map((audit) => audit.id),
      today,
    );
    return list.map((audit) => toAuditDto(audit, summaries.get(audit.id)!));
  }

  async function toDto(audit: Audit): Promise<AuditDto> {
    const [dto] = await toDtos([audit]);
    return dto!;
  }

  return {
    getOwned,

    async list(ownerId: string): Promise<AuditDto[]> {
      return toDtos(await audits.listByOwner(ownerId));
    },

    async get(ownerId: string, auditId: string): Promise<AuditDto> {
      return toDto(await getOwned(ownerId, auditId));
    },

    async create(ownerId: string, data: AuditData): Promise<AuditDto> {
      const audit = await audits.create(ownerId, {
        name: data.name,
        framework: data.framework,
        auditDate: data.auditDate ? fromIsoDate(data.auditDate) : null,
        remindersOn: data.remindersOn,
      });
      return toDto(audit);
    },

    async update(ownerId: string, auditId: string, data: AuditUpdateData): Promise<AuditDto> {
      assertNotArchived(await getOwned(ownerId, auditId));
      const { auditDate, ...rest } = data;
      const audit = await audits.update(auditId, {
        ...rest,
        ...(auditDate !== undefined && { auditDate: auditDate ? fromIsoDate(auditDate) : null }),
      });
      return toDto(audit);
    },

    async dashboard(ownerId: string, auditId: string): Promise<AuditDashboardDto> {
      const audit = await getOwned(ownerId, auditId);
      const todayIso = todayIsoDate(clock());
      const today = fromIsoDate(todayIso);
      const [summaries, figures] = await Promise.all([
        audits.summaries([audit.id], today),
        audits.dashboardFigures(audit.id, today),
      ]);

      return {
        summary: summaries.get(audit.id)!,
        filesScanning: figures.filesScanning,
        owners: buildOwnerProgress(
          figures.byOwnerAndStatus,
          figures.overdueByOwner,
          figures.ownerNames,
        ),
        overdue: figures.overdue.map((request) => {
          const dueDate = toIsoDate(request.dueDate);
          return {
            id: request.id,
            controlRef: request.controlRef,
            title: request.title,
            ownerEmail: request.ownerEmail,
            ownerName: request.ownerName,
            dueDate,
            daysOverdue: daysBetween(dueDate, todayIso),
            status: request.status,
          };
        }),
      };
    },

    /** Archiving is idempotent: archiving an archived audit returns it unchanged. */
    async archive(ownerId: string, auditId: string): Promise<AuditDto> {
      const audit = await getOwned(ownerId, auditId);
      if (audit.archivedAt) return toDto(audit);
      return toDto(await audits.update(auditId, { archivedAt: clock() }));
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
