export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Outbound email. Resend in production (Phase 3), the console locally, a fake in tests. */
export interface MailerPort {
  send(message: EmailMessage): Promise<void>;
}
