import type { Audit, EvidenceRequest, Prisma, PrismaClient, RequestStatus } from '@prisma/client';
import { ConflictError } from '../errors';
import type { ActivityCreateData } from './activityRepository';

export type RequestWithCounts = EvidenceRequest & { _count: { submissions: number } };
export type RequestWithAudit = RequestWithCounts & { audit: Audit };

/** Someone else changed the request since the caller loaded it (optimistic lock lost). */
export function staleRequestError(): ConflictError {
  return new ConflictError(
    'This request was changed by someone else. Refresh to see the latest version.',
    'STALE_VERSION',
  );
}

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

    /** A request, but only if it belongs to one of this manager's audits (IDOR protection). */
    findForManager(id: string, managerId: string): Promise<RequestWithAudit | null> {
      return prisma.evidenceRequest.findFirst({
        where: { id, audit: { ownerId: managerId } },
        include: { audit: true, ...withSubmissionCount },
      });
    },

    /**
     * Changes a request's status and writes the matching activity entry in one transaction, with
     * optimistic locking: the update only applies if the version is still the one the caller saw.
     * If someone else changed the request in the meantime, nothing is written and the caller gets
     * a 409, so two reviewers (or a reviewer and the scan job) can never overwrite each other.
     */
    transitionStatus(input: {
      requestId: string;
      expectedVersion: number;
      toStatus: RequestStatus;
      activity: Omit<ActivityCreateData, 'requestId' | 'toStatus'>;
    }): Promise<RequestWithCounts> {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.evidenceRequest.updateMany({
          where: { id: input.requestId, version: input.expectedVersion },
          data: { status: input.toStatus, version: { increment: 1 } },
        });
        if (updated.count === 0) throw staleRequestError();

        await tx.activityLog.create({
          data: { ...input.activity, requestId: input.requestId, toStatus: input.toStatus },
        });
        return tx.evidenceRequest.findUniqueOrThrow({
          where: { id: input.requestId },
          include: withSubmissionCount,
        });
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

    /**
     * Deletes a request that has no submissions, with what it leaves behind: uploads that were
     * never submitted and its reminder history. Submissions keep their foreign-key guard, so if
     * one lands in the meantime, the whole delete fails instead of losing evidence.
     */
    async delete(id: string): Promise<void> {
      await prisma.$transaction([
        prisma.evidenceFile.deleteMany({ where: { requestId: id, submissionId: null } }),
        prisma.activityLog.deleteMany({ where: { requestId: id } }),
        prisma.evidenceRequest.delete({ where: { id } }),
      ]);
    },
  };
}

export type RequestRepository = ReturnType<typeof createRequestRepository>;
