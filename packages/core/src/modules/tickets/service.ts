import type { RequestContext } from "../../shared/context";
import { ConflictError, NotFoundOrForbiddenError } from "../../shared/errors";
import { generateToken, hashToken } from "../../shared/tokens";
import type { ClockPort } from "../../ports/clock";
import type { AuditReadRecord, AuditReader, AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import type { OrderRepository } from "../orders/repository";
import type { TicketRepository } from "./repository";
import { assertTicketTransition } from "./transitions";
import { TICKET_SUPPORT_ROLES, type IssuedTicket, type TicketRecord } from "./types";

export interface TicketsServiceDeps {
  tickets: TicketRepository;
  orders: OrderRepository;
  audit: AuditRepository;
  // Optional so ticket EMISSION works in minimal wiring; support operations
  // require these to be present.
  memberships?: MembershipLookup | undefined;
  auditReader?: AuditReader | undefined;
  clock?: ClockPort | undefined;
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

  // -------------------------------------------------------------------------
  // Support operations (FR-TKT-007..013) — staff, audited
  // -------------------------------------------------------------------------

  /** FR-TKT-009 — block a valid ticket with justification. */
  async blockTicket(
    ctx: RequestContext,
    ticketId: string,
    input: { justification: string },
  ): Promise<TicketRecord> {
    await this.requireSupport(ctx);
    const ticket = await this.mustFindTicket(ctx.organizationId, ticketId);
    // Capture BEFORE the update — the repo may return a live reference that
    // the guarded update mutates in place (aliasing).
    const previousStatus = ticket.status;
    assertTicketTransition(previousStatus, "BLOCKED");

    const changed = await this.deps.tickets.updateStatus(
      ctx.organizationId,
      ticketId,
      ["VALID"],
      "BLOCKED",
      { blockedAt: this.now() },
    );
    if (!changed) throw new ConflictError("Ticket is not in a blockable state");

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "ticket.blocked",
      resourceType: "ticket",
      resourceId: ticketId,
      justification: input.justification,
      before: { status: previousStatus },
      after: { status: "BLOCKED" },
      correlationId: ctx.correlationId,
    });
    return { ...ticket, status: "BLOCKED" };
  }

  /** FR-TKT-009 — unblock a blocked ticket with justification. */
  async unblockTicket(
    ctx: RequestContext,
    ticketId: string,
    input: { justification: string },
  ): Promise<TicketRecord> {
    await this.requireSupport(ctx);
    const ticket = await this.mustFindTicket(ctx.organizationId, ticketId);
    const previousStatus = ticket.status;
    assertTicketTransition(previousStatus, "VALID");

    const changed = await this.deps.tickets.updateStatus(
      ctx.organizationId,
      ticketId,
      ["BLOCKED"],
      "VALID",
    );
    if (!changed) throw new ConflictError("Ticket is not blocked");

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "ticket.unblocked",
      resourceType: "ticket",
      resourceId: ticketId,
      justification: input.justification,
      before: { status: previousStatus },
      after: { status: "VALID" },
      correlationId: ctx.correlationId,
    });
    return { ...ticket, status: "VALID" };
  }

  /**
   * FR-TKT-012/013 — correct non-financial participant data. The previous
   * value is preserved in the audit `before` (never overwritten silently).
   */
  async correctParticipant(
    ctx: RequestContext,
    ticketId: string,
    input: { participantName?: string | undefined; participantEmail?: string | undefined },
  ): Promise<TicketRecord> {
    await this.requireSupport(ctx);
    const ticket = await this.mustFindTicket(ctx.organizationId, ticketId);
    if (ticket.status === "CANCELLED" || ticket.status === "REFUNDED") {
      throw new ConflictError("Cannot edit a cancelled or refunded ticket");
    }

    // Capture BEFORE the write — the trail must keep the old values.
    const before = {
      participantName: ticket.participantName,
      participantEmail: ticket.participantEmail,
    };
    await this.deps.tickets.updateParticipant(ctx.organizationId, ticketId, input);

    const after = {
      participantName: input.participantName ?? ticket.participantName,
      participantEmail: input.participantEmail ?? ticket.participantEmail,
    };
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "ticket.participant_corrected",
      resourceType: "ticket",
      resourceId: ticketId,
      before,
      after,
      correlationId: ctx.correlationId,
    });
    return { ...ticket, ...after };
  }

  /**
   * FR-TKT-007/008 — transfer ownership. Rotates the token so the previous
   * link/QR is invalidated immediately, updates the holder, and keeps the old
   * holder in the audit trail. Returns the new raw token for delivery.
   */
  async transferTicket(
    ctx: RequestContext,
    ticketId: string,
    input: { participantName: string; participantEmail: string },
  ): Promise<IssuedTicket> {
    await this.requireSupport(ctx);
    const ticket = await this.mustFindTicket(ctx.organizationId, ticketId);
    if (ticket.status !== "VALID") {
      throw new ConflictError("Only a valid ticket can be transferred");
    }

    const before = {
      participantName: ticket.participantName,
      participantEmail: ticket.participantEmail,
    };
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    await this.deps.tickets.updateTokenHash(ctx.organizationId, ticketId, tokenHash);
    await this.deps.tickets.updateParticipant(ctx.organizationId, ticketId, input);

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "ticket.transferred",
      resourceType: "ticket",
      resourceId: ticketId,
      before,
      after: {
        participantName: input.participantName,
        participantEmail: input.participantEmail,
        tokenRotated: true,
      },
      correlationId: ctx.correlationId,
    });
    return {
      ticket: {
        ...ticket,
        tokenHash,
        participantName: input.participantName,
        participantEmail: input.participantEmail,
      },
      rawToken,
    };
  }

  /** FR-TKT-011 — current status plus the audited history of the ticket. */
  async getTicketHistory(
    ctx: RequestContext,
    ticketId: string,
  ): Promise<{ ticket: TicketRecord; history: AuditReadRecord[] }> {
    await this.requireSupport(ctx);
    const ticket = await this.mustFindTicket(ctx.organizationId, ticketId);
    if (!this.deps.auditReader) {
      return { ticket, history: [] };
    }
    const history = await this.deps.auditReader.listByResource(
      ctx.organizationId,
      "ticket",
      ticketId,
    );
    return { ticket, history };
  }

  /**
   * Terminal refund of every non-terminal ticket of an order (FR-PAY-013,
   * FR-TKT-010). Called by the refund coordinator on a confirmed refund /
   * chargeback — system actor, idempotent (guarded bulk transition).
   */
  async refundTicketsForOrder(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<number> {
    const count = await this.deps.tickets.transitionOrderTickets(
      organizationId,
      orderId,
      ["VALID", "BLOCKED"],
      "REFUNDED",
      { cancelledAt: this.now() },
    );
    if (count > 0) {
      await this.deps.audit.append({
        organizationId,
        actorType: "system",
        action: "tickets.refunded",
        resourceType: "order",
        resourceId: orderId,
        after: { count },
        correlationId: meta.correlationId,
      });
    }
    return count;
  }

  // -------------------------------------------------------------------------

  private now(): Date {
    return this.deps.clock ? this.deps.clock.now() : new Date();
  }

  private async requireSupport(ctx: RequestContext): Promise<void> {
    if (!this.deps.memberships) throw new NotFoundOrForbiddenError();
    await requireActiveRole(this.deps.memberships, ctx, TICKET_SUPPORT_ROLES);
  }

  private async mustFindTicket(
    organizationId: string,
    ticketId: string,
  ): Promise<TicketRecord> {
    const ticket = await this.deps.tickets.findByIdScoped(organizationId, ticketId);
    if (!ticket) throw new NotFoundOrForbiddenError();
    return ticket;
  }
}
