import type { ActivityLog, ActorType, PrismaClient, RequestStatus } from '@prisma/client';

export interface ActivityCreateData {
  requestId: string;
  actorType: ActorType;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  fromStatus?: RequestStatus | null;
  toStatus?: RequestStatus | null;
  comment?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * The activity log is append-only (PRD §7): this repository deliberately has no update or
 * delete. Entries that go with a status change are written inside that change's transaction
 * (see requestRepository.transitionStatus); this is for standalone events such as downloads.
 */
export function createActivityRepository(prisma: PrismaClient) {
  return {
    create(data: ActivityCreateData): Promise<ActivityLog> {
      return prisma.activityLog.create({ data });
    },

    listByRequest(requestId: string): Promise<ActivityLog[]> {
      return prisma.activityLog.findMany({
        where: { requestId },
        orderBy: { createdAt: 'desc' },
      });
    },

    /** The comment on the most recent change that sent the request back to the owner. */
    async latestChangesComment(requestId: string): Promise<string | null> {
      const entry = await prisma.activityLog.findFirst({
        where: { requestId, toStatus: 'CHANGES_REQUESTED' },
        orderBy: { createdAt: 'desc' },
        select: { comment: true },
      });
      return entry?.comment ?? null;
    },
  };
}

export type ActivityRepository = ReturnType<typeof createActivityRepository>;
