import type { MailerPort } from "../../ports/mailer";
import type { OrderRecord } from "../orders/types";
import type { IssuedTicket } from "../tickets/types";
import type { NotificationRepository } from "./repository";

export interface NotificationsServiceDeps {
  notifications: NotificationRepository;
  mailer: MailerPort;
  /** Public base URL for buyer-facing links (e.g. https://app.example.com). */
  baseUrl: string;
}

/**
 * FR-NOT-001/006: order confirmation with ticket links, persisted with
 * attempt tracking. A mail failure NEVER fails the purchase (NFR-AVL-006) —
 * it is recorded and retried; recovery also exists via the order page.
 */
export class NotificationsService {
  constructor(private readonly deps: NotificationsServiceDeps) {}

  async sendOrderConfirmation(
    order: OrderRecord,
    tickets: IssuedTicket[],
    meta: { correlationId: string; eventTitle?: string | undefined },
  ): Promise<void> {
    const notification = await this.deps.notifications.create({
      organizationId: order.organizationId,
      type: "order_confirmation",
      recipient: order.buyerEmail,
      subject: `Seu pedido ${order.code} foi confirmado`,
      orderId: order.id,
      correlationId: meta.correlationId,
    });

    const { html, text } = this.renderOrderConfirmation(order, tickets, meta.eventTitle);

    try {
      const result = await this.deps.mailer.send({
        to: order.buyerEmail,
        subject: `Seu pedido ${order.code} foi confirmado`,
        html,
        text,
        notificationId: notification.id,
      });
      await this.deps.notifications.markSent(notification.id, result.providerMessageId);
    } catch (error) {
      // Purchase already succeeded — record and move on (retry path exists).
      await this.deps.notifications.markFailed(
        notification.id,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  // -------------------------------------------------------------------------

  private renderOrderConfirmation(
    order: OrderRecord,
    tickets: IssuedTicket[],
    eventTitle?: string,
  ): { html: string; text: string } {
    const title = eventTitle ?? "seu evento";
    const total = (order.totalCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const links = tickets.map(
      ({ rawToken }, index) =>
        `${this.deps.baseUrl}/t/${encodeURIComponent(rawToken)}`,
    );

    const text = [
      `Olá, ${order.buyerName}!`,
      ``,
      `Seu pedido ${order.code} para ${title} foi confirmado. Total: ${total}.`,
      ``,
      `Seus ingressos:`,
      ...links.map((link, index) => `Ingresso ${index + 1}: ${link}`),
      ``,
      `Apresente o QR Code de cada ingresso na entrada. Não compartilhe estes links.`,
    ].join("\n");

    const html = `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <h2>Pedido confirmado 🎉</h2>
        <p>Olá, <strong>${escapeHtml(order.buyerName)}</strong>!</p>
        <p>Seu pedido <strong>${order.code}</strong> para <strong>${escapeHtml(title)}</strong> foi confirmado.</p>
        <p>Total: <strong>${total}</strong></p>
        <h3>Seus ingressos</h3>
        <ol>
          ${links
            .map(
              (link, index) =>
                `<li style="margin-bottom:8px"><a href="${link}">Abrir ingresso ${index + 1}</a></li>`,
            )
            .join("")}
        </ol>
        <p style="color:#666;font-size:13px">Apresente o QR Code de cada ingresso na entrada. Não compartilhe estes links — quem tiver o link tem o ingresso.</p>
      </div>
    `;

    return { html, text };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
