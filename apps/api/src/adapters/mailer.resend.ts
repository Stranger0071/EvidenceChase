import type { EmailMessage, MailerPort } from '../ports/mailer';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Sends email through Resend's HTTPS API. It's HTTPS rather than SMTP because free hosting tiers
 * often block outbound SMTP ports. Plain `fetch`, so there's no SDK to keep up to date.
 */
export class ResendMailer implements MailerPort {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, ...message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend rejected the email (${response.status}): ${detail.slice(0, 300)}`);
    }
  }
}
