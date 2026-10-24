import type { Prisma, PrismaClient, ReminderKind } from '@prisma/client';
import { OPEN_STATUSES } from '../domain/overdue';

const withAuditName = {
  audit: { select: { id: true, name: true } },
} satisfies Prisma.EvidenceRequestInclude;

export type RequestForReminder = Prisma.EvidenceRequestGetPayload<{
  include: typeof withAuditName;
}>;

export interface ReminderClaim {
  requestId: string;
  kind: ReminderKind;
  sentOn: Date;
}

export function createReminderRepository(prisma: PrismaClient) {
  return {
    /** Requests an owner still owes, in audits that are live and have reminders switched on. */
    listDue(): Promise<RequestForReminder[]> {
      return prisma.evidenceRequest.findMany({
        where: {
          status: { in: [...OPEN_STATUSES] },
          audit: { remindersOn: true, archivedAt: null },
        },
        include: withAuditName,
        orderBy: { dueDate: 'asc' },
      });
    },

    /** Owners who have already had a reminder email today (the one-email-per-owner-per-day cap). */
    async ownersRemindedOn(sentOn: Date): Promise<Set<string>> {
      const rows = await prisma.reminderLog.findMany({
        where: { sentOn },
        select: { request: { select: { ownerEmail: true } } },
        distinct: ['requestId'],
      });
      return new Set(rows.map((row) => row.request.ownerEmail));
    },

    /**
     * Claims reminders before sending them: `INSERT … ON CONFLICT DO NOTHING RETURNING`. Only rows
     * this call actually inserted come back, so if the job runs twice (a retry, or two overlapping
     * calls) the second one claims nothing and sends nothing. The unique constraint is the lock.
     */
    claim(claims: ReminderClaim[]): Promise<Array<{ id: string; requestId: string }>> {
      if (claims.length === 0) return Promise.resolve([]);
      return prisma.reminderLog.createManyAndReturn({
        data: claims,
        skipDuplicates: true,
        select: { id: true, requestId: true },
      });
    },

    /** Gives claims back after a failed send, so the next run tries again. */
    async release(ids: string[]): Promise<void> {
      if (ids.length > 0) await prisma.reminderLog.deleteMany({ where: { id: { in: ids } } });
    },
  };
}

export type ReminderRepository = ReturnType<typeof createReminderRepository>;
