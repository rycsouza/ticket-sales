import type { RequestContext } from "../../shared/context";
import { NotFoundOrForbiddenError } from "../../shared/errors";
import type { ClockPort } from "../../ports/clock";
import type { AuditReadRecord, AuditReader, AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import type { OrderRecord } from "../orders/types";
import type { PaymentRecord } from "../payments/types";
import type { TicketRecord } from "../tickets/types";
import type { OrderNoteRepository } from "./repository";
import type { AddOrderNoteInput } from "./schemas";
import { SUPPORT_NOTE_ROLES, SUPPORT_TIMELINE_ROLES, type OrderNoteRecord } from "./types";

/** Narrow readers — support never writes another module's tables. */
export interface SupportOrderReader {
  findByIdScoped(organizationId: string, orderId: string): Promise<OrderRecord | null>;
}
export interface SupportPaymentReader {
  listByOrder(organizationId: string, orderId: string): Promise<PaymentRecord[]>;
}
export interface SupportTicketReader {
  listByOrder(organizationId: string, orderId: string): Promise<TicketRecord[]>;
}

export interface SupportServiceDeps {
  notes: OrderNoteRepository;
  orders: SupportOrderReader;
  payments: SupportPaymentReader;
  tickets: SupportTicketReader;
  audit: AuditReader;
  memberships: MembershipLookup;
  clock: ClockPort;
}

export interface OrderTimeline {
  order: OrderRecord;
  payments: PaymentRecord[];
  tickets: TicketRecord[];
  events: AuditReadRecord[];
  notes: OrderNoteRecord[];
}

export class SupportService {
  constructor(private readonly deps: SupportServiceDeps) {}

  /**
   * FR-ADM-002 — unified order timeline: the order, its payments, tickets, the
   * audited activity for the order AND each of its tickets, and internal notes.
   * Read-only; org-scoped; sensitive fields never widened here.
   */
  async getOrderTimeline(ctx: RequestContext, orderId: string): Promise<OrderTimeline> {
    await requireActiveRole(this.deps.memberships, ctx, SUPPORT_TIMELINE_ROLES);

    const order = await this.deps.orders.findByIdScoped(ctx.organizationId, orderId);
    if (!order) throw new NotFoundOrForbiddenError();

    const [payments, tickets, notes] = await Promise.all([
      this.deps.payments.listByOrder(ctx.organizationId, orderId),
      this.deps.tickets.listByOrder(ctx.organizationId, orderId),
      this.deps.notes.listByOrder(ctx.organizationId, orderId),
    ]);

    const refs = [
      { resourceType: "order", resourceId: orderId },
      ...tickets.map((ticket) => ({ resourceType: "ticket", resourceId: ticket.id })),
    ];
    const events = await this.deps.audit.listByResources(ctx.organizationId, refs);
    events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return { order, payments, tickets, events, notes };
  }

  /** FR-ADM-009 — add an internal note (invisible to the buyer). */
  async addNote(
    ctx: RequestContext,
    orderId: string,
    input: AddOrderNoteInput,
  ): Promise<OrderNoteRecord> {
    await requireActiveRole(this.deps.memberships, ctx, SUPPORT_NOTE_ROLES);

    const order = await this.deps.orders.findByIdScoped(ctx.organizationId, orderId);
    if (!order) throw new NotFoundOrForbiddenError();

    return this.deps.notes.create({
      organizationId: ctx.organizationId,
      orderId,
      authorUserId: ctx.userId,
      body: input.body,
    });
  }

  async listNotes(ctx: RequestContext, orderId: string): Promise<OrderNoteRecord[]> {
    await requireActiveRole(this.deps.memberships, ctx, SUPPORT_NOTE_ROLES);
    const order = await this.deps.orders.findByIdScoped(ctx.organizationId, orderId);
    if (!order) throw new NotFoundOrForbiddenError();
    return this.deps.notes.listByOrder(ctx.organizationId, orderId);
  }
}
