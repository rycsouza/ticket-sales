import type { MailerPort, SendMailInput, SendMailResult } from "@ingressos/core/ports";

const SEND_API = "https://send.api.mailtrap.io/api/send";

/**
 * Mailtrap Sending API adapter (ARQUITETURA §16). Domain must be verified
 * (SPF/DKIM) on the Mailtrap side. Failures throw — the notifications module
 * records and retries; a mail failure never fails a purchase (NFR-AVL-006).
 */
export class MailtrapAdapter implements MailerPort {
  constructor(
    private readonly apiToken: string,
    private readonly senderEmail: string,
    private readonly senderName = "Ingressos",
  ) {}

  async send(input: SendMailInput): Promise<SendMailResult> {
    const response = await fetch(SEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: this.senderEmail, name: this.senderName },
        to: [{ email: input.to }],
        subject: input.subject,
        html: input.html,
        text: input.text,
        custom_variables: { notification_id: input.notificationId },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Mailtrap send failed with status ${response.status}`);
    }
    const data = (await response.json()) as { message_ids?: string[] };
    return { providerMessageId: data.message_ids?.[0] ?? "unknown" };
  }
}
