import type { Prisma, PrismaClient, RequestStatus } from '@prisma/client';
import type { ExportScope } from '@evidencechase/shared';

const exportInclude = {
  // The evidence under review now. Earlier submissions stay in the app's history, not in the pack.
  submissions: {
    where: { isCurrent: true },
    include: { files: { where: { state: 'VERIFIED' }, orderBy: { createdAt: 'asc' } } },
  },
  // Who accepted it, and when: the latest ACCEPT entry in the append-only log.
  activity: {
    where: { action: 'ACCEPT' },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { actorEmail: true, createdAt: true },
  },
} satisfies Prisma.EvidenceRequestInclude;

export type RequestForExport = Prisma.EvidenceRequestGetPayload<{ include: typeof exportInclude }>;

const SCOPE_STATUSES: Record<ExportScope, RequestStatus[]> = {
  accepted: ['ACCEPTED'],
  all: ['PENDING', 'SUBMITTED', 'CHANGES_REQUESTED', 'ACCEPTED'],
};

export function createExportRepository(prisma: PrismaClient) {
  return {
    /** The requests (with verified current evidence) that go into an audit's evidence pack. */
    listForExport(auditId: string, scope: ExportScope): Promise<RequestForExport[]> {
      return prisma.evidenceRequest.findMany({
        where: { auditId, status: { in: SCOPE_STATUSES[scope] } },
        include: exportInclude,
        orderBy: { controlRef: 'asc' },
      });
    },
  };
}

export type ExportRepository = ReturnType<typeof createExportRepository>;
