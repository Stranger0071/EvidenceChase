import { todayIsoDate, toIsoDate } from '@evidencechase/shared';
import type { ReminderKind } from '@prisma/client';
import { OPEN_STATUSES } from '../domain/overdue';
import { computeReminderKind, describeDue } from '../domain/reminderSchedule';
import { ConflictError, DomainError, NotFoundError } from '../errors';
import type { Logger } from '../lib/logger';
import type { Repositories } from '../repositories';
import { reminderCapKey, type RequestForReminder } from '../repositories/reminderRepository';
import { assertNotArchived, type Clock } from './auditService';
import { fromIsoDate } from './mappers';
import type { NotificationService } from './notificationService';

export interface ReminderRunSummary {
  /** Open requests in live audits with reminders on. */
  scanned: number;
  /** Of those, how many had a reminder due today. */
  due: number;
  emailsSent: number;
  requestsReminded: number;
  /** Due, but the owner already had a reminder email today (one per owner per day). */
  skippedOwnerCap: number;
  /** Due, but already claimed by an earlier run today: this is what makes re-runs harmless. */
  skippedAlreadySent: number;
  /** Emails that failed; their claims were released so the next run retries them. */
  failed: number;
}

/**
 * The product does the chasing (PRD §8.6, Phase 5). Every reminder is *claimed* in ReminderLog
 * before it's sent, and the unique (request, kind, day) constraint means a second run on the same
 * day finds nothing left to claim. If an email fails, its claims are released for the next run.
 * That's at-most-once per day, with a retry on failure.
 */
export function createReminderService(
  repos: Repositories,
  notifications: NotificationService,
  logger: Logger,
  clock: Clock = () => new Date(),
) {
  const { reminders, requests, activity, users } = repos;

  /** Emails one owner their claimed reminders. Returns false (and releases the claims) on failure. */
  async function sendToOwner(
    owner: { email: string; name: string | null },
    items: Array<{ request: RequestForReminder; claimId: string; kind: ReminderKind }>,
    today: string,
    actor: { type: 'SYSTEM' } | { type: 'MANAGER'; id: string; email: string | null },
  ): Promise<boolean> {
    try {
      await notifications.reminderDigest(
        owner,
        items.map(({ request }) => ({ ...request, auditName: request.audit.name })),
        today,
      );
    } catch (error) {
      logger.error({ err: error, to: owner.email }, 'Reminder email failed; will retry');
      await reminders.release(items.map((item) => item.claimId));
      return false;
    }

    for (const { request, kind } of items) {
      await activity.create({
        requestId: request.id,
        actorType: actor.type,
        ...(actor.type === 'MANAGER' && { actorId: actor.id, actorEmail: actor.email }),
        action: kind === 'NUDGE' ? 'NUDGED' : 'REMINDER_SENT',
        comment: `Reminder emailed to ${request.ownerEmail} (${describeDue(toIsoDate(request.dueDate), today).toLowerCase()})`,
      });
    }
    return true;
  }

  return {
    /** The daily job, run at 09:00 IST by cron-job.org. Safe to run any number of times. */
    async run(): Promise<ReminderRunSummary> {
      const today = todayIsoDate(clock());
      const sentOn = fromIsoDate(today);

      const open = await reminders.listDue();
      const due = open.flatMap((request) => {
        const kind = computeReminderKind(toIsoDate(request.dueDate), today);
        return kind ? [{ request, kind }] : [];
      });

      const alreadyEmailed = await reminders.ownersRemindedOn(sentOn);
      const capKeyOf = (request: RequestForReminder) =>
        reminderCapKey(request.audit.ownerId, request.ownerEmail);
      const eligible = due.filter(({ request }) => !alreadyEmailed.has(capKeyOf(request)));
      const claims = await reminders.claim(
        eligible.map(({ request, kind }) => ({ requestId: request.id, kind, sentOn })),
      );
      const claimIdByRequest = new Map(claims.map((claim) => [claim.requestId, claim.id]));

      // One digest per manager and owner, so an email never lists another company's audits.
      const byOwner = new Map<
        string,
        Array<{ request: RequestForReminder; claimId: string; kind: ReminderKind }>
      >();
      for (const { request, kind } of eligible) {
        const claimId = claimIdByRequest.get(request.id);
        if (!claimId) continue;
        const key = capKeyOf(request);
        byOwner.set(key, [...(byOwner.get(key) ?? []), { request, claimId, kind }]);
      }

      const summary: ReminderRunSummary = {
        scanned: open.length,
        due: due.length,
        emailsSent: 0,
        requestsReminded: 0,
        skippedOwnerCap: due.length - eligible.length,
        skippedAlreadySent: eligible.length - claims.length,
        failed: 0,
      };

      for (const items of byOwner.values()) {
        const email = items[0]!.request.ownerEmail;
        const name = items.find((item) => item.request.ownerName)?.request.ownerName ?? null;
        if (await sendToOwner({ email, name }, items, today, { type: 'SYSTEM' })) {
          summary.emailsSent += 1;
          summary.requestsReminded += items.length;
        } else {
          summary.failed += 1;
        }
      }
      return summary;
    },

    /**
     * "Nudge now": an immediate reminder for one request, sent by the manager. It respects the
     * same cap as the daily job, so an owner never gets more than one reminder email a day.
     */
    async nudge(managerId: string, auditId: string, requestId: string): Promise<void> {
      const request = await requests.findForManager(requestId, managerId);
      if (!request || request.auditId !== auditId) throw new NotFoundError('Evidence request');
      assertNotArchived(request.audit);
      if (!OPEN_STATUSES.includes(request.status)) {
        throw new ConflictError(
          'Evidence has already been submitted for this request',
          'NOTHING_TO_CHASE',
        );
      }

      const today = todayIsoDate(clock());
      const sentOn = fromIsoDate(today);
      if (
        (await reminders.ownersRemindedOn(sentOn)).has(
          reminderCapKey(managerId, request.ownerEmail),
        )
      ) {
        throw new ConflictError(
          `${request.ownerEmail} has already had a reminder today. You can nudge again tomorrow.`,
          'ALREADY_REMINDED_TODAY',
        );
      }

      const [claim] = await reminders.claim([{ requestId, kind: 'NUDGE', sentOn }]);
      if (!claim) {
        throw new ConflictError(
          'A reminder for this request was already sent today',
          'ALREADY_REMINDED_TODAY',
        );
      }

      const manager = await users.findById(managerId);
      const sent = await sendToOwner(
        { email: request.ownerEmail, name: request.ownerName },
        [
          {
            request: {
              ...request,
              audit: {
                id: request.audit.id,
                name: request.audit.name,
                ownerId: request.audit.ownerId,
              },
            },
            claimId: claim.id,
            kind: 'NUDGE',
          },
        ],
        today,
        { type: 'MANAGER', id: managerId, email: manager?.email ?? null },
      );
      if (!sent)
        throw new DomainError(
          502,
          'EMAIL_FAILED',
          "The reminder email couldn't be sent. Try again, or use Copy link.",
        );
    },
  };
}

export type ReminderService = ReturnType<typeof createReminderService>;
