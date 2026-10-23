import type { EvidenceRequest, Prisma, PrismaClient } from '@prisma/client';

export type RequestWithCounts = EvidenceRequest & { _count: { submissions: number } };

const withSubmissionCount = { _count: { select: { submissions: true } } } as const;

export interface RequestCreateData {
  controlRef: string;
  title: string;
  instructions: string | null;
  ownerName: string | null;
  ownerEmail: string;
  dueDate: Date;
}

/** Requests are always looked up through their audit ID, which the service has already checked. */
export function createRequestRepository(prisma: PrismaClient) {
  return {
    listByAudit(auditId: string): Promise<RequestWithCounts[]> {
      return prisma.evidenceRequest.findMany({
        where: { auditId },
        include: withSubmissionCount,
        orderBy: [{ dueDate: 'asc' }, { controlRef: 'asc' }],
      });
    },

    findInAudit(id: string, auditId: string): Promise<RequestWithCounts | null> {
      return prisma.evidenceRequest.findFirst({
        where: { id, auditId },
        include: withSubmissionCount,
      });
    },

    /** Every control ID in the audit, with its request ID, for duplicate checks. */
    listControlRefs(auditId: string): Promise<Array<{ id: string; controlRef: string }>> {
      return prisma.evidenceRequest.findMany({
        where: { auditId },
        select: { id: true, controlRef: true },
      });
    },

    create(auditId: string, data: RequestCreateData): Promise<RequestWithCounts> {
      return prisma.evidenceRequest.create({
        data: { ...data, auditId },
        include: withSubmissionCount,
      });
    },

    /** Inserts every row in one transaction: the whole import succeeds or none of it does. */
    async createMany(auditId: string, rows: RequestCreateData[]): Promise<number> {
      const result = await prisma.$transaction((tx) =>
        tx.evidenceRequest.createMany({ data: rows.map((row) => ({ ...row, auditId })) }),
      );
      return result.count;
    },

    /**
     * Updates a request. When the owner's email changes, every live magic link for the request is
     * revoked in the same transaction, so the previous owner's link stops working (FR-5).
     */
    update(
      id: string,
      data: Prisma.EvidenceRequestUpdateInput,
      options: { revokeAccessTokens: boolean },
    ): Promise<RequestWithCounts> {
      return prisma.$transaction(async (tx) => {
        if (options.revokeAccessTokens) {
          await tx.accessToken.updateMany({
            where: { requestId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        return tx.evidenceRequest.update({ where: { id }, data, include: withSubmissionCount });
      });
    },

    async delete(id: string): Promise<void> {
      await prisma.evidenceRequest.delete({ where: { id } });
    },
  };
}

export type RequestRepository = ReturnType<typeof createRequestRepository>;
