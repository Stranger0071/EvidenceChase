import type { Logger } from '../lib/logger';
import type { EmailMessage, MailerPort } from '../ports/mailer';

/** Local development mailer: logs each email instead of sending it, so magic links can be copied. */
export class ConsoleMailer implements MailerPort {
  constructor(private readonly logger: Logger) {}

  async send(message: EmailMessage): Promise<void> {
    this.logger.info(
      { to: message.to, subject: message.subject, text: message.text },
      'Email (console mailer, not sent)',
    );
  }
}
