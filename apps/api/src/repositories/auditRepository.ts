import type { AuditSummary, RequestStatus } from '@evidencechase/shared';
import type { Audit, AuditFramework, Prisma, PrismaClient } from '@prisma/client';
import { OPEN_STATUSES } from '../domain/overdue';
import { buildAuditSummary, type StatusCounts } from '../domain/summary';

export interface AuditCreateData {
  name: string;
  framework: AuditFramework;
  auditDate: Date | null;
  remindersOn: boolean;
}

/**
 * Every query that reads or changes an audit is scoped by `ownerId`. That's what stops one
 * manager reaching another manager's audit by guessing its ID (IDOR).
 */
export function createAuditRepository(prisma: PrismaClient) {
  return {
    listByOwner(ownerId: string): Promise<Audit[]> {
      return prisma.audit.findMany({
        where: { ownerId },
        orderBy: [{ archivedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
      });
    },

    /**
     * By ID alone, with no ownership check. Only for callers that authorized the request another
     * way (the signed export link). Everything a manager does goes through findOwned.
     */
    findById(id: string): Promise<Audit | null> {
      return prisma.audit.findUnique({ where: { id } });
    },

    findOwned(id: string, ownerId: string): Promise<Audit | null> {
      return prisma.audit.findFirst({ where: { id, ownerId } });
    },

    create(ownerId: string, data: AuditCreateData): Promise<Audit> {
      return prisma.audit.create({ data: { ...data, ownerId } });
    },

    update(id: string, data: Prisma.AuditUpdateInput): Promise<Audit> {
      return prisma.audit.update({ where: { id }, data });
    },

    /**
     * Readiness summaries for several audits in two queries: status counts grouped by audit, and
     * overdue counts grouped by audit. Overdue is computed in SQL from the due date, never stored.
     */
    async summaries(auditIds: string[], today: Date): Promise<Map<string, AuditSummary>> {
      const [statusGroups, overdueGroups] = await Promise.all([
        prisma.evidenceRequest.groupBy({
          by: ['auditId', 'status'],
          where: { auditId: { in: auditIds } },
          _count: { _all: true },
        }),
        prisma.evidenceRequest.groupBy({
          by: ['auditId'],
          where: {
            auditId: { in: auditIds },
            status: { in: [...OPEN_STATUSES] },
            dueDate: { lt: today },
          },
          _count: { _all: true },
        }),
      ]);

      const counts = new Map<string, StatusCounts>();
      for (const group of statusGroups) {
        const entry = counts.get(group.auditId) ?? {};
        entry[group.status as RequestStatus] = group._count._all;
        counts.set(group.auditId, entry);
      }
      const overdue = new Map(overdueGroups.map((group) => [group.auditId, group._count._all]));

      return new Map(
        auditIds.map((id) => [id, buildAuditSummary(counts.get(id) ?? {}, overdue.get(id) ?? 0)]),
      );
    },

    /**
     * The figures behind the audit dashboard: per-owner status counts, per-owner overdue counts,
     * the most overdue requests, and how many submitted files are still being scanned. Overdue is
     * computed in SQL from the due date, exactly as on the summary, so the numbers always agree.
     */
    async dashboardFigures(auditId: string, today: Date) {
      const overdueWhere = { auditId, status: { in: [...OPEN_STATUSES] }, dueDate: { lt: today } };
      const [byOwnerAndStatus, overdueByOwner, owners, overdue, filesScanning] = await Promise.all([
        prisma.evidenceRequest.groupBy({
          by: ['ownerEmail', 'status'],
          where: { auditId },
          _count: { _all: true },
        }),
        prisma.evidenceRequest.groupBy({
          by: ['ownerEmail'],
          where: overdueWhere,
          _count: { _all: true },
        }),
        prisma.evidenceRequest.findMany({
          where: { auditId, ownerName: { not: null } },
          select: { ownerEmail: true, ownerName: true },
          distinct: ['ownerEmail'],
        }),
        prisma.evidenceRequest.findMany({
          where: overdueWhere,
          orderBy: [{ dueDate: 'asc' }, { controlRef: 'asc' }],
          take: 10,
        }),
        prisma.evidenceFile.count({ where: { state: 'AWAITING_SCAN', request: { auditId } } }),
      ]);
      return {
        byOwnerAndStatus: byOwnerAndStatus.map((group) => ({
          ownerEmail: group.ownerEmail,
          status: group.status as RequestStatus,
          count: group._count._all,
        })),
        overdueByOwner: new Map(
          overdueByOwner.map((group) => [group.ownerEmail, group._count._all]),
        ),
        ownerNames: new Map(owners.map((owner) => [owner.ownerEmail, owner.ownerName])),
        overdue,
        filesScanning,
      };
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;
