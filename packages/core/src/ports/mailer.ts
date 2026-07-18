/**
 * Transactional e-mail port. Mailtrap Sending API in production, sandbox in
 * dev/staging (ARQUITETURA §16). Failures are recorded and retried via queue
 * (FR-NOT-006) — the mailer itself just attempts one delivery.
 */
export interface MailerPort {
  send(input: SendMailInput): Promise<SendMailResult>;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Idempotency/correlation reference persisted with the Notification record. */
  notificationId: string;
}

export interface SendMailResult {
  providerMessageId: string;
}
