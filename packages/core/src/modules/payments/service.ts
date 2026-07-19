import { cents } from "../../shared/money";
import { ConflictError, NotFoundOrForbiddenError } from "../../shared/errors";
import type { CachePort } from "../../ports/cache";
import type { ClockPort } from "../../ports/clock";
import type {
  NormalizedPspEvent,
  PspPort,
  PspTransactionStatus,
  WebhookInput,
} from "../../ports/psp";
import type { AuditRepository } from "../audit/repository";
import type { OrderRepository } from "../orders/repository";
import type { OrderRecord } from "../orders/types";
import type { PaymentEventRepository, PaymentRepository } from "./repository";
import type { PaymentRecord, PaymentStatus } from "./types";

/** Card fields produced by the client tokenization SDK. NEVER include a PAN/CVV. */
export interface CardChargeInput {
  cardToken: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string | undefined;
  payerIdentification?: { type: string; number: string } | undefined;
}

/** What payments needs from orders — implemented by OrdersService. */
export interface OrderPaymentCoordinator {
  markOrderPaid(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<boolean>;
}

/** Post-approval side effects (tickets + e-mail) — one orchestration point. */
export interface PaidOrderFulfiller {
  fulfill(organizationId: string, orderId: string, correlationId: string): Promise<void>;
}

/**
 * Commission reversal on refund/chargeback (FR-PRM-011) — implemented by the
 * promoters module. Optional so payments works in environments without it.
 */
export interface CommissionReversalCoordinator {
  reverseForOrder(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<void>;
}

/**
 * Settles a refund/chargeback across order + tickets (FR-PAY-013) — implemented
 * at the composition root over OrdersService + TicketsService. Optional.
 */
export interface RefundSettlementCoordinator {
  settleRefund(
    organizationId: string,
    orderId: string,
    kind: "REFUNDED" | "CHARGEBACK",
    meta: { correlationId: string },
  ): Promise<void>;
}

export interface PaymentsServiceDeps {
  payments: PaymentRepository;
  paymentEvents: PaymentEventRepository;
  orders: OrderRepository;
  orderCoordinator: OrderPaymentCoordinator;
  fulfiller: PaidOrderFulfiller;
  psp: PspPort;
  audit: AuditRepository;
  clock: ClockPort;
  commissionCoordinator?: CommissionReversalCoordinator | undefined;
  refundCoordinator?: RefundSettlementCoordinator | undefined;
  /** Optional: throttles gateway reconciliation so polling never hammers the PSP. */
  cache?: CachePort | undefined;
}

/**
 * Minimum gap between two gateway reconciliations of the same order. The status
 * page polls every ~10s; without this it would hit the PSP on every poll.
 */
const RECONCILE_THROTTLE_SECONDS = 20;

/** Maps an authoritative PSP status to the domain event the webhook would emit. */
function statusToEventType(status: PspTransactionStatus): NormalizedPspEvent["type"] | null {
  switch (status) {
    case "approved":
      return "payment.approved";
    case "rejected":
      return "payment.rejected";
    case "expired":
    case "cancelled":
      return "payment.expired";
    case "refunded":
    case "partially_refunded":
      return "payment.refunded";
    case "charged_back":
      return "payment.charged_back";
    case "pending":
      return null; // nothing actionable yet
  }
}

export type WebhookOutcome =
  | { outcome: "processed"; type: string }
  | { outcome: "duplicate" }
  | { outcome: "ignored" };

export class PaymentsService {
  constructor(private readonly deps: PaymentsServiceDeps) {}

  /**
   * Buyer-initiated Pix charge (FR-CHK-013, FR-PAY-019). Idempotent recovery:
   * an unexpired pending charge for the order is returned as-is, so page
   * refreshes never create duplicate charges (FR-CHK-016/018).
   */
  async createPixChargeForOrder(
    code: string,
    email: string,
    meta: { correlationId: string },
  ): Promise<PaymentRecord> {
    const order = await this.deps.orders.findByCode(code);
    if (!order || order.buyerEmail !== email.toLowerCase()) {
      throw new NotFoundOrForbiddenError();
    }
    return this.chargePix(order, meta);
  }

  /**
   * Token path (Print 4): the caller already proved access via the order access
   * token, so no e-mail check here — we load the order by its scoped id and
   * charge it. Same idempotent core as the code+e-mail path.
   */
  async createPixChargeById(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<PaymentRecord> {
    const order = await this.deps.orders.findByIdScoped(organizationId, orderId);
    if (!order) throw new NotFoundOrForbiddenError();
    return this.chargePix(order, meta);
  }

  /**
   * Card charge for the buyer's order (FR-CHK-014, NFR-SEC-008). The card is
   * tokenized in the browser — only an opaque token reaches us, never a PAN.
   * Access is proven by the order access token (caller resolved the scope), so
   * the amount AND payer e-mail are taken SERVER-SIDE from the order, never from
   * the client. Card approval is synchronous: on "approved" we mark paid and
   * fulfill immediately; a later webhook/reconciliation is idempotent.
   */
  async createCardChargeForOrder(
    organizationId: string,
    orderId: string,
    card: CardChargeInput,
    meta: { correlationId: string },
  ): Promise<{ status: PaymentStatus }> {
    const now = this.deps.clock.now();

    const order = await this.deps.orders.findByIdScoped(organizationId, orderId);
    if (!order) throw new NotFoundOrForbiddenError();
    if (order.status !== "AWAITING_PAYMENT") {
      throw new ConflictError("Order is not awaiting payment");
    }
    if (order.expiresAt && order.expiresAt.getTime() <= now.getTime()) {
      throw new ConflictError("Order has expired");
    }

    // Attempt counter keeps a retry after a rejection possible while the key
    // still deduplicates crashes/retries of the SAME attempt (FR-PAY-004).
    const attempt = await this.deps.payments.countByOrder(order.organizationId, order.id);
    const idempotencyKey = `card:${order.id}:${attempt}`;

    const charge = await this.deps.psp.createCardCharge({
      orderId: order.id,
      amount: cents(order.totalCents),
      description: `Pedido ${order.code}`,
      cardToken: card.cardToken,
      installments: card.installments,
      paymentMethodId: card.paymentMethodId,
      issuerId: card.issuerId,
      payerEmail: order.buyerEmail,
      payerIdentification: card.payerIdentification,
      idempotencyKey,
    });

    const payment = await this.deps.payments.create({
      organizationId: order.organizationId,
      orderId: order.id,
      provider: "mercadopago",
      method: "CARD",
      amountCents: order.totalCents,
      idempotencyKey,
      providerTransactionId: charge.providerTransactionId,
      correlationId: meta.correlationId,
    });

    await this.deps.audit.append({
      organizationId: order.organizationId,
      actorType: "system",
      action: "payment.created",
      resourceType: "payment",
      resourceId: payment.id,
      after: { method: "CARD", amountCents: order.totalCents },
      correlationId: meta.correlationId,
    });

    // Synchronous outcome (BR-PAY-001: only a confirmed "approved" pays).
    if (charge.status === "approved") {
      await this.deps.payments.transitionStatus(payment.id, ["CREATED"], "APPROVED", {
        approvedAt: now,
      });
      await this.deps.orderCoordinator.markOrderPaid(
        order.organizationId,
        order.id,
        meta,
      );
      const fresh = await this.deps.orders.findByIdScoped(order.organizationId, order.id);
      if (fresh?.status === "PAID") {
        await this.deps.fulfiller.fulfill(order.organizationId, order.id, meta.correlationId);
      }
      return { status: "APPROVED" };
    }
    if (charge.status === "rejected" || charge.status === "cancelled") {
      await this.deps.payments.transitionStatus(payment.id, ["CREATED"], "REJECTED");
      return { status: "REJECTED" };
    }
    // pending / in_process: leave it PROCESSING; the webhook or reconciliation
    // finalizes it (both idempotent).
    await this.deps.payments.transitionStatus(payment.id, ["CREATED"], "PROCESSING");
    return { status: "PROCESSING" };
  }

  private async chargePix(
    order: OrderRecord,
    meta: { correlationId: string },
  ): Promise<PaymentRecord> {
    const now = this.deps.clock.now();

    if (order.status !== "AWAITING_PAYMENT") {
      throw new ConflictError("Order is not awaiting payment");
    }
    if (order.expiresAt && order.expiresAt.getTime() <= now.getTime()) {
      throw new ConflictError("Order has expired");
    }

    const reusable = await this.deps.payments.findReusablePixForOrder(
      order.organizationId,
      order.id,
      now,
    );
    if (reusable) return reusable;

    // Attempt counter keeps retries after a rejection possible while the
    // key still deduplicates crashes/retries of the SAME attempt (FR-PAY-004)
    const attempt = await this.deps.payments.countByOrder(order.organizationId, order.id);
    const idempotencyKey = `pix:${order.id}:${attempt}`;

    // Pix charge dies together with the inventory reservation (BR alignment)
    const chargeExpiresAt = order.expiresAt ?? new Date(now.getTime() + 15 * 60 * 1000);

    const charge = await this.deps.psp.createPixCharge({
      orderId: order.id,
      amount: cents(order.totalCents),
      description: `Pedido ${order.code}`,
      payerEmail: order.buyerEmail,
      expiresAt: chargeExpiresAt,
      idempotencyKey,
    });

    const payment = await this.deps.payments.create({
      organizationId: order.organizationId,
      orderId: order.id,
      provider: "mercadopago",
      method: "PIX",
      amountCents: order.totalCents,
      idempotencyKey,
      providerTransactionId: charge.providerTransactionId,
      pixQrCode: charge.qrCode,
      pixQrCodeText: charge.qrCodeText,
      expiresAt: charge.expiresAt,
      correlationId: meta.correlationId,
    });

    await this.deps.audit.append({
      organizationId: order.organizationId,
      actorType: "system",
      action: "payment.created",
      resourceType: "payment",
      resourceId: payment.id,
      after: { method: "PIX", amountCents: order.totalCents },
      correlationId: meta.correlationId,
    });

    return payment;
  }

  /**
   * Webhook entry (FR-PAY-005..008, §18 das regras): verify → persist →
   * process, with every downstream effect idempotent. Throwing AFTER the
   * claim marks the event FAILED — the provider retry (or manual reprocess)
   * will claim it again.
   */
  async processWebhook(
    input: WebhookInput,
    meta: { correlationId: string },
  ): Promise<WebhookOutcome> {
    const normalized = await this.deps.psp.verifyAndParseWebhook(input);
    if (!normalized) return { outcome: "ignored" };

    const claimed = await this.deps.paymentEvents.claim({
      provider: "mercadopago",
      providerEventId: normalized.providerEventId,
      providerTransactionId: normalized.providerTransactionId,
      type: normalized.type,
      payload: { type: normalized.type, occurredAt: normalized.occurredAt.toISOString() },
      correlationId: meta.correlationId,
    });
    if (!claimed) return { outcome: "duplicate" };

    try {
      await this.applyEvent(normalized, meta);
      await this.deps.paymentEvents.markOutcome(claimed.id, "PROCESSED");
      return { outcome: "processed", type: normalized.type };
    } catch (error) {
      await this.deps.paymentEvents.markOutcome(
        claimed.id,
        "FAILED",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Gateway reconciliation (Print 5, FR-PAY-008). The webhook is the primary
   * confirmation path; this is the safety net for when it is delayed or lost.
   * It asks the PSP for the authoritative state of the order's pending charge
   * and, if that diverges from ours, applies the SAME idempotent effect the
   * webhook would (approve → mark paid → fulfill; reject/expire → move the
   * payment). Throttled via cache so a polling status page never hammers the
   * provider, and it NEVER throws — a buyer's status page must render even when
   * the gateway is unreachable.
   */
  async reconcileOrder(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<void> {
    try {
      if (this.deps.cache) {
        const fresh = await this.deps.cache.setIfAbsent(
          `payment-reconcile:${orderId}`,
          "1",
          RECONCILE_THROTTLE_SECONDS,
        );
        if (!fresh) return; // reconciled very recently — rely on DB + webhook
      }

      const payments = await this.deps.payments.listByOrder(organizationId, orderId);
      // Newest pending charge with a provider transaction is the one to verify.
      const pending = [...payments]
        .reverse()
        .find(
          (p) =>
            p.providerTransactionId && (p.status === "CREATED" || p.status === "PROCESSING"),
        );
      if (!pending?.providerTransactionId) return;

      const transaction = await this.deps.psp.getTransaction(pending.providerTransactionId);
      const type = statusToEventType(transaction.status);
      if (!type) return; // still pending — nothing to reconcile

      await this.applyEvent(
        {
          providerEventId: `reconcile:${pending.providerTransactionId}:${type}`,
          providerTransactionId: pending.providerTransactionId,
          type,
          occurredAt: this.deps.clock.now(),
        },
        meta,
      );
    } catch {
      // Best-effort: never let reconciliation break the buyer's status page.
    }
  }

  // -------------------------------------------------------------------------

  private async applyEvent(
    event: NormalizedPspEvent,
    meta: { correlationId: string },
  ): Promise<void> {
    const payment = await this.deps.payments.findByProviderTransactionId(
      event.providerTransactionId,
    );
    if (!payment) {
      // Event for a transaction we do not know — reconciliation queue
      // material (FR-FIN-006). Fail so the provider retries meanwhile.
      throw new Error(`No payment found for transaction ${event.providerTransactionId}`);
    }

    switch (event.type) {
      case "payment.approved": {
        // BR-PAY-001: only this confirmed provider event approves a payment.
        await this.deps.payments.transitionStatus(
          payment.id,
          ["CREATED", "PROCESSING"],
          "APPROVED",
          { approvedAt: this.deps.clock.now() },
        );
        await this.deps.orderCoordinator.markOrderPaid(
          payment.organizationId,
          payment.orderId,
          meta,
        );
        // Fulfill whenever the order IS paid now — not "when this call
        // transitioned it". Guarded transitions return false on retries, but
        // a crash between transition and fulfillment must heal on the next
        // delivery; fulfillment itself is idempotent (FR-TKT-016).
        const order = await this.deps.orders.findByIdScoped(
          payment.organizationId,
          payment.orderId,
        );
        if (order?.status === "PAID") {
          await this.deps.fulfiller.fulfill(
            payment.organizationId,
            payment.orderId,
            meta.correlationId,
          );
        }
        return;
      }
      case "payment.rejected": {
        await this.deps.payments.transitionStatus(
          payment.id,
          ["CREATED", "PROCESSING"],
          "REJECTED",
        );
        return;
      }
      case "payment.expired": {
        await this.deps.payments.transitionStatus(
          payment.id,
          ["CREATED", "PROCESSING"],
          "EXPIRED",
        );
        return;
      }
      case "payment.refunded":
      case "payment.charged_back": {
        // Full flows land in Fase 4/5; record the fact and alert support now
        // (FR-PAY-013/014, FR-ADM-015).
        const to = event.type === "payment.refunded" ? "REFUNDED" : "CHARGED_BACK";
        await this.deps.payments.transitionStatus(
          payment.id,
          ["APPROVED", "PARTIALLY_REFUNDED", "DISPUTED"],
          to,
        );
        await this.deps.audit.append({
          organizationId: payment.organizationId,
          actorType: "system",
          action: `payment.${to.toLowerCase()}_received`,
          resourceType: "payment",
          resourceId: payment.id,
          correlationId: meta.correlationId,
        });
        // FR-PAY-013: settle the refund across order + tickets, then reverse
        // commission (FR-PRM-011). Both idempotent; failures here must not fail
        // the webhook (the provider will redeliver and the guards re-run).
        if (this.deps.refundCoordinator) {
          await this.deps.refundCoordinator
            .settleRefund(
              payment.organizationId,
              payment.orderId,
              event.type === "payment.refunded" ? "REFUNDED" : "CHARGEBACK",
              meta,
            )
            .catch(() => undefined);
        }
        if (this.deps.commissionCoordinator) {
          await this.deps.commissionCoordinator
            .reverseForOrder(payment.organizationId, payment.orderId, meta)
            .catch(() => undefined);
        }
        return;
      }
    }
  }
}
