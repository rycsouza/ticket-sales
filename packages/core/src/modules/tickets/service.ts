import { NotFoundOrForbiddenError } from "../../shared/errors";
import { generateToken, hashToken } from "../../shared/tokens";
import type { AuditRepository } from "../audit/repository";
import type { OrderRepository } from "../orders/repository";
import type { TicketRepository } from "./repository";
import type { IssuedTicket, TicketRecord } from "./types";

export interface TicketsServiceDeps {
  tickets: TicketRepository;
  orders: OrderRepository;
  audit: AuditRepository;
}

export class TicketsService {
  constructor(private readonly deps: TicketsServiceDeps) {}

  /**
   * Emits one ticket per paid order item (FR-TKT-001). Idempotent by
   * construction: the unique orderItemId constraint means retries — including
   * duplicated payment webhooks — can never double-issue (FR-TKT-016).
   *
   * Raw tokens are returned ONLY for tickets issued by THIS call; they exist
   * to be delivered to the buyer (link/e-mail) and are never persisted or
   * audited (FR-TKT-002/003).
   */
  async issueForOrder(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<IssuedTicket[]> {
    const order = await this.deps.orders.findByIdScoped(organizationId, orderId);
    if (!order || order.status !== "PAID") {
      // BR-PAY-003: tickets only for paid orders (courtesy flow is separate)
      throw new NotFoundOrForbiddenError("Order is not payable for ticket emission");
    }

    const items = await this.deps.orders.listItems(organizationId, orderId);
    const existing = await this.deps.tickets.listByOrder(organizationId, orderId);
    const ticketedItemIds = new Set(existing.map((ticket) => ticket.orderItemId));

    const issued: IssuedTicket[] = [];
    for (const item of items) {
      if (ticketedItemIds.has(item.id)) continue;

      const rawToken = generateToken();
      const ticket = await this.deps.tickets.createForOrderItem({
        organizationId,
        eventId: item.eventId,
        orderId,
        orderItemId: item.id,
        ticketTypeId: item.ticketTypeId,
        tokenHash: hashToken(rawToken),
        participantName: order.buyerName,
        participantEmail: order.buyerEmail,
      });
      // null = another issuer raced us on this item — skip, don't fail.
      if (ticket) issued.push({ ticket, rawToken });
    }

    if (issued.length > 0) {
      await this.deps.audit.append({
        organizationId,
        actorType: "system",
        action: "tickets.issued",
        resourceType: "order",
        resourceId: orderId,
        after: { count: issued.length },
        correlationId: meta.correlationId,
      });
    }

    return issued;
  }

  /** Public ticket page access — the token in the link IS the credential. */
  async getPublicTicket(rawToken: string): Promise<TicketRecord> {
    const ticket = await this.deps.tickets.findByTokenHash(hashToken(rawToken));
    if (!ticket) throw new NotFoundOrForbiddenError();
    return ticket;
  }

  /**
   * Regenerates the token of every VALID ticket of the order and returns the
   * new raw tokens (FR-TKT-006 resend + BR-TKT-002). Old links and QR codes
   * become invalid immediately — that is the point: recovery never multiplies
   * live credentials.
   */
  async rotateTokensForOrder(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<IssuedTicket[]> {
    const tickets = await this.deps.tickets.listByOrder(organizationId, orderId);
    const rotated: IssuedTicket[] = [];

    for (const ticket of tickets) {
      if (ticket.status !== "VALID") continue;
      const rawToken = generateToken();
      await this.deps.tickets.updateTokenHash(organizationId, ticket.id, hashToken(rawToken));
      rotated.push({ ticket: { ...ticket, tokenHash: hashToken(rawToken) }, rawToken });
    }

    if (rotated.length > 0) {
      await this.deps.audit.append({
        organizationId,
        actorType: "system",
        action: "tickets.tokens_rotated",
        resourceType: "order",
        resourceId: orderId,
        after: { count: rotated.length },
        correlationId: meta.correlationId,
      });
    }
    return rotated;
  }
}
