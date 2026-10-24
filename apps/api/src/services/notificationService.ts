import { toIsoDate } from '@evidencechase/shared';
import type { Env } from '../config/env';
import {
  changesRequestedEmail,
  evidenceRequestedEmail,
  evidenceSubmittedEmail,
  reminderDigestEmail,
  scanFailedEmail,
  type RequestLink,
} from '../emails/templates';
import { describeDue } from '../domain/reminderSchedule';
import type { Logger } from '../lib/logger';
import type { EmailMessage, MailerPort } from '../ports/mailer';
import type { TokenService } from './tokenService';

interface RequestForEmail {
  id: string;
  auditId: string;
  controlRef: string;
  title: string;
  ownerName: string | null;
  ownerEmail: string;
  dueDate: Date;
}

/**
 * Every email the product sends, in one place. Sending never undoes the change that triggered
 * it: the change is already saved, so a failed email is logged and the manager can use
 * "Copy link" as a fallback. "Send requests" and reminders report failures back instead: the
 * first so the manager knows, the second so the reminder job can retry.
 */
export function createNotificationService(
  mailer: MailerPort,
  tokenService: TokenService,
  env: Env,
  logger: Logger,
) {
  async function sendQuietly(message: EmailMessage, context: Record<string, unknown>) {
    try {
      await mailer.send(message);
    } catch (error) {
      logger.error(
        { err: error, to: message.to, subject: message.subject, ...context },
        'Email failed',
      );
    }
  }

  const auditUrl = (auditId: string) => `${env.WEB_ORIGIN}/audits/${auditId}`;

  return {
    /**
     * One reminder email for one owner, covering the given requests, each with a fresh link (which
     * also refreshes the link's 30-day expiry). Throws if sending fails.
     */
    async reminderDigest(
      owner: { email: string; name: string | null },
      requests: Array<RequestForEmail & { status: string; auditName: string }>,
      today: string,
    ): Promise<void> {
      const items = [];
      for (const request of requests) {
        const { url } = await tokenService.issue(request.id);
        const dueDate = toIsoDate(request.dueDate);
        items.push({
          controlRef: request.controlRef,
          title: request.title,
          auditName: request.auditName,
          dueDate,
          dueLabel: describeDue(dueDate, today),
          overdue: dueDate < today,
          changesRequested: request.status === 'CHANGES_REQUESTED',
          url,
        });
      }
      await mailer.send(reminderDigestEmail({ to: owner.email, ownerName: owner.name, items }));
    },

    /**
     * Groups requests by owner and sends each owner one email listing all of theirs, each with
     * a fresh magic link (FR-13 style: one email per owner, not one per request).
     */
    async sendEvidenceRequests(
      auditName: string,
      requests: RequestForEmail[],
    ): Promise<{ emailsSent: number; failedRecipients: string[] }> {
      const byOwner = new Map<string, RequestForEmail[]>();
      for (const request of requests) {
        byOwner.set(request.ownerEmail, [...(byOwner.get(request.ownerEmail) ?? []), request]);
      }

      const failedRecipients: string[] = [];
      for (const [ownerEmail, ownerRequests] of byOwner) {
        const links: RequestLink[] = [];
        for (const request of ownerRequests) {
          const { url } = await tokenService.issue(request.id);
          links.push({
            controlRef: request.controlRef,
            title: request.title,
            dueDate: toIsoDate(request.dueDate),
            url,
          });
        }
        try {
          await mailer.send(
            evidenceRequestedEmail({
              to: ownerEmail,
              ownerName: ownerRequests.find((request) => request.ownerName)?.ownerName ?? null,
              auditName,
              links,
            }),
          );
        } catch (error) {
          logger.error({ err: error, to: ownerEmail }, 'Evidence request email failed');
          failedRecipients.push(ownerEmail);
        }
      }
      return { emailsSent: byOwner.size - failedRecipients.length, failedRecipients };
    },

    async changesRequested(request: RequestForEmail, comment: string): Promise<void> {
      const { url } = await tokenService.issue(request.id);
      await sendQuietly(
        changesRequestedEmail({
          to: request.ownerEmail,
          ownerName: request.ownerName,
          controlRef: request.controlRef,
          title: request.title,
          comment,
          url,
        }),
        { requestId: request.id },
      );
    },

    async fileRejected(request: RequestForEmail, fileName: string, reason: string): Promise<void> {
      const { url } = await tokenService.issue(request.id);
      await sendQuietly(
        scanFailedEmail({
          to: request.ownerEmail,
          ownerName: request.ownerName,
          controlRef: request.controlRef,
          title: request.title,
          fileName,
          reason,
          url,
        }),
        { requestId: request.id },
      );
    },

    async evidenceSubmitted(
      request: RequestForEmail,
      auditName: string,
      managerEmail: string,
      fileCount: number,
    ) {
      await sendQuietly(
        evidenceSubmittedEmail({
          to: managerEmail,
          auditName,
          controlRef: request.controlRef,
          title: request.title,
          ownerEmail: request.ownerEmail,
          fileCount,
          url: auditUrl(request.auditId),
        }),
        { requestId: request.id },
      );
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
