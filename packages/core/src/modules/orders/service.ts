import { randomBytes } from "node:crypto";
import {
  ConflictError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../shared/errors";
import type { ClockPort } from "../../ports/clock";
import type { AuditRepository } from "../audit/repository";
import type { EventRecord } from "../events/types";
import type { ReservationStore } from "../inventory/reservations";
import type { SalesBatchRecord } from "../inventory/types";
import type { OrderRepository } from "./repository";
import type { CreateOrderInput } from "./schemas";
import { RESERVATION_TTL_MINUTES, type OrderRecord } from "./types";

/** Public read access to events — only PUBLISHED rows are visible here. */
export interface PublicEventReader {
  findPublishedById(eventId: string): Promise<EventRecord | null>;
}

export interface PublicBatchReader {
  findByIdScoped(organizationId: string, batchId: string): Promise<SalesBatchRecord | null>;
}

/**
 * Checkout resolver (implemented by the promoters module, injected at the
 * composition root). Orders never imports promoters — it depends only on this
 * narrow interface. Money is resolved server-side; attribution is best-effort.
 */
export interface CheckoutResolver {
  /** Throws ValidationFailedError when an explicitly supplied coupon is invalid. */
  resolveDiscount(input: {
    organizationId: string;
    eventId: string;
    couponCode: string;
    subtotalCents: number;
    now: Date;
  }): Promise<{ couponId: string; discountCents: number }>;
  recordAttribution(input: {
    organizationId: string;
    eventId: string;
    orderId: string;
    couponCode?: string | undefined;
    linkRef?: string | undefined;
    utm?:
      | {
          source?: string | undefined;
          medium?: string | undefined;
          campaign?: string | undefined;
          content?: string | undefined;
          term?: string | undefined;
        }
      | undefined;
    now: Date;
  }): Promise<void>;
}

export interface OrdersServiceDeps {
  orders: OrderRepository;
  reservations: ReservationStore;
  publicEvents: PublicEventReader;
  batches: PublicBatchReader;
  audit: AuditRepository;
  clock: ClockPort;
  /** Optional: absent in environments without the promoters module. */
  checkout?: CheckoutResolver | undefined;
}

// Crockford-like base32 (no 0/O/1/I) — public order codes are unguessable
// enough combined with the buyer-email check and rate limiting.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateOrderCode(): string {
  const bytes = randomBytes(12);
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += CODE_ALPHABET[(bytes[i] as number) % CODE_ALPHABET.length];
  }
  return code;
}

export class OrdersService {
  constructor(private readonly deps: OrdersServiceDeps) {}

  /**
   * Public checkout entry (FR-CHK-*, FR-PAY-001). Everything monetary is
   * derived from the batch rows; the reservation is atomic all-or-nothing.
   */
  async createOrder(
    input: CreateOrderInput,
    meta: { correlationId: string },
  ): Promise<{ order: OrderRecord; expiresAt: Date }> {
    const now = this.deps.clock.now();

    const event = await this.deps.publicEvents.findPublishedById(input.eventId);
    if (!event) throw new NotFoundOrForbiddenError();
    this.assertWithinWindow(now, event.salesStartAt, event.salesEndAt, "Sales are not open");

    // Load and validate every batch BEFORE reserving anything
    const units: { batchId: string; ticketTypeId: string; unitPriceCents: number }[] = [];
    let totalQuantity = 0;

    for (const item of input.items) {
      const batch = await this.deps.batches.findByIdScoped(event.organizationId, item.batchId);
      if (!batch || batch.eventId !== event.id) throw new NotFoundOrForbiddenError();
      if (batch.status !== "OPEN") {
        throw new ConflictError("This batch is not open for sales");
      }
      this.assertWithinWindow(
        now,
        batch.salesStartAt,
        batch.salesEndAt,
        "This batch is outside its sales window",
      );
      if (batch.maxPerOrder !== null && item.quantity > batch.maxPerOrder) {
        throw new ValidationFailedError(
          `At most ${batch.maxPerOrder} tickets per order for this batch`,
        );
      }

      totalQuantity += item.quantity;
      for (let i = 0; i < item.quantity; i++) {
        units.push({
          batchId: batch.id,
          ticketTypeId: batch.ticketTypeId,
          unitPriceCents: batch.priceCents,
        });
      }
    }

    if (event.maxTicketsPerOrder !== null && totalQuantity > event.maxTicketsPerOrder) {
      throw new ValidationFailedError(
        `At most ${event.maxTicketsPerOrder} tickets per order for this event`,
      );
    }

    // Server-side money only (BR-FIN-001; CLAUDE_SECURITY_RULES §19)
    const subtotalCents = units.reduce((sum, unit) => sum + unit.unitPriceCents, 0);
    const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MINUTES * 60 * 1000);

    // Coupon discount resolved server-side (FR-CHK-008). An invalid explicit
    // coupon rejects the whole checkout so the buyer never pays a surprise price.
    let discountCents = 0;
    if (input.coupon && this.deps.checkout) {
      const resolved = await this.deps.checkout.resolveDiscount({
        organizationId: event.organizationId,
        eventId: event.id,
        couponCode: input.coupon,
        subtotalCents,
        now,
      });
      discountCents = Math.max(0, Math.min(resolved.discountCents, subtotalCents));
    }

    const order = await this.deps.orders.createPendingOrder({
      organizationId: event.organizationId,
      eventId: event.id,
      code: generateOrderCode(),
      buyerName: input.buyer.name,
      buyerEmail: input.buyer.email,
      buyerDocument: input.buyer.document,
      buyerPhone: input.buyer.phone,
      subtotalCents,
      discountCents,
      totalCents: subtotalCents - discountCents,
      expiresAt,
      correlationId: meta.correlationId,
      units,
    });

    // Attribution is best-effort: a failure here must never fail the purchase
    // (mirrors notifications). The commission path degrades to "no promoter".
    if (this.deps.checkout && (input.coupon || input.ref || input.utm)) {
      try {
        await this.deps.checkout.recordAttribution({
          organizationId: event.organizationId,
          eventId: event.id,
          orderId: order.id,
          couponCode: input.coupon,
          linkRef: input.ref,
          utm: input.utm,
          now,
        });
      } catch (error) {
        await this.deps.audit.append({
          organizationId: event.organizationId,
          actorType: "system",
          action: "order.attribution_failed",
          resourceType: "order",
          resourceId: order.id,
          after: { message: error instanceof Error ? error.message : "unknown" },
          correlationId: meta.correlationId,
        });
      }
    }

    return { order, expiresAt };
  }

  /**
   * Public status lookup: code alone is not enough — the buyer e-mail must
   * match, so codes cannot be enumerated into personal data (BR-PRV).
   */
  async getOrderForBuyer(code: string, email: string): Promise<OrderRecord> {
    const order = await this.deps.orders.findByCode(code);
    if (!order || order.buyerEmail !== email.toLowerCase()) {
      throw new NotFoundOrForbiddenError();
    }
    return order;
  }

  /**
   * Called by the payments module on confirmed approval (BR-PAY-001).
   * Returns true only for the caller that performed the transition —
   * duplicated webhooks get false and must not re-emit tickets.
   */
  async markOrderPaid(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<boolean> {
    const transitioned = await this.deps.orders.transitionStatus(
      organizationId,
      orderId,
      ["AWAITING_PAYMENT"],
      "PAID",
      { paidAt: this.deps.clock.now() },
    );

    if (!transitioned) {
      const order = await this.deps.orders.findByIdScoped(organizationId, orderId);
      if (order && order.status !== "PAID") {
        // Approved payment for a non-payable order (e.g. already EXPIRED):
        // never resurrect inventory silently — flag for support (FR-ADM-015).
        await this.deps.audit.append({
          organizationId,
          actorType: "system",
          action: "order.payment_after_terminal_state",
          resourceType: "order",
          resourceId: orderId,
          after: { status: order.status },
          correlationId: meta.correlationId,
        });
      }
      return false;
    }

    await this.deps.reservations.confirmForOrder(organizationId, orderId);

    await this.deps.audit.append({
      organizationId,
      actorType: "system",
      action: "order.paid",
      resourceType: "order",
      resourceId: orderId,
      correlationId: meta.correlationId,
    });

    return true;
  }

  /**
   * Settles a confirmed refund / chargeback on the order (FR-PAY-011/013).
   * Guarded and idempotent: a duplicated provider event finds the order already
   * terminal and returns false. Called by the refund coordinator (system).
   */
  async settleRefund(
    organizationId: string,
    orderId: string,
    kind: "REFUNDED" | "CHARGEBACK",
    meta: { correlationId: string },
  ): Promise<boolean> {
    const now = this.deps.clock.now();
    const transitioned = await this.deps.orders.transitionStatus(
      organizationId,
      orderId,
      ["PAID", "PARTIALLY_REFUNDED"],
      kind,
      { refundedAt: now, ...(kind === "CHARGEBACK" ? { cancelledAt: now } : {}) },
    );
    if (!transitioned) return false;

    await this.deps.audit.append({
      organizationId,
      actorType: "system",
      action: kind === "REFUNDED" ? "order.refunded" : "order.chargeback",
      resourceType: "order",
      resourceId: orderId,
      correlationId: meta.correlationId,
    });
    return true;
  }

  /**
   * Expiry sweep (FR-INV-007, BR-INV-003). Idempotent: the guarded status
   * transition makes concurrent sweeps harmless, and reservations release
   * availability exactly once.
   */
  async expireDueOrders(limit = 100): Promise<number> {
    const now = this.deps.clock.now();
    const due = await this.deps.reservations.listOrdersWithDueReservations(now, limit);

    let expired = 0;
    for (const { organizationId, orderId } of due) {
      const transitioned = await this.deps.orders.transitionStatus(
        organizationId,
        orderId,
        ["AWAITING_PAYMENT", "CREATED"],
        "EXPIRED",
      );
      // Release even when the order already left AWAITING_PAYMENT — a PAID
      // order confirmed its reservations, so ACTIVE leftovers mean the sweep
      // raced another path; releaseForOrder only touches ACTIVE rows.
      if (transitioned) {
        await this.deps.reservations.releaseForOrder(organizationId, orderId, "EXPIRED");
        expired += 1;
      }
    }
    return expired;
  }

  // -------------------------------------------------------------------------

  private assertWithinWindow(
    now: Date,
    startsAt: Date | null,
    endsAt: Date | null,
    message: string,
  ): void {
    if (startsAt && now.getTime() < startsAt.getTime()) throw new ConflictError(message);
    if (endsAt && now.getTime() > endsAt.getTime()) throw new ConflictError(message);
  }
}
