import { cents } from "../../shared/money";
import { ConflictError, NotFoundOrForbiddenError } from "../../shared/errors";
import type { ClockPort } from "../../ports/clock";
import type { NormalizedPspEvent, PspPort, WebhookInput } from "../../ports/psp";
import type { AuditRepository } from "../audit/repository";
import type { OrderRepository } from "../orders/repository";
import type { PaymentEventRepository, PaymentRepository } from "./repository";
import type { PaymentRecord } from "./types";

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

export interface PaymentsServiceDeps {
  payments: PaymentRepository;
  paymentEvents: PaymentEventRepository;
  orders: OrderRepository;
  orderCoordinator: OrderPaymentCoordinator;
  fulfiller: PaidOrderFulfiller;
  psp: PspPort;
  audit: AuditRepository;
  clock: ClockPort;
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
    const now = this.deps.clock.now();

    const order = await this.deps.orders.findByCode(code);
    if (!order || order.buyerEmail !== email.toLowerCase()) {
      throw new NotFoundOrForbiddenError();
    }
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
        return;
      }
    }
  }
}
