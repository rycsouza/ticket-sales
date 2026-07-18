import type { Cents } from "../shared/money";

/**
 * Payment Service Provider port (ARQUITETURA §10).
 *
 * The core depends only on this interface. Adapters (Mercado Pago first) are
 * selected by configuration (PSP_PROVIDER) and injected at the boundary.
 * Every new adapter must pass the same contract test suite: duplicated
 * webhook, out-of-order events, refund, expiration.
 *
 * Card data NEVER touches our servers — hosted checkout / tokenization only
 * (FR-CHK-014, NFR-SEC-008).
 */
export interface PspPort {
  createPixCharge(input: CreatePixChargeInput): Promise<PixCharge>;
  createCardCharge(input: CreateCardChargeInput): Promise<CardCharge>;
  refund(input: RefundInput): Promise<RefundResult>;
  /** Fetch authoritative transaction state — used for reconciliation (FR-PAY-008). */
  getTransaction(providerTransactionId: string): Promise<PspTransaction>;
  /**
   * Verify webhook authenticity (signature + timestamp) and normalize it.
   * Returns null when the event type is unknown/irrelevant — callers must
   * ignore those safely (CLAUDE_SECURITY_RULES §18).
   */
  verifyAndParseWebhook(input: WebhookInput): Promise<NormalizedPspEvent | null>;
}

export interface CreatePixChargeInput {
  /** Our order id — becomes the external reference at the provider. */
  orderId: string;
  amount: Cents;
  description: string;
  /** Charge expiration; must match the inventory reservation TTL. */
  expiresAt: Date;
  idempotencyKey: string;
}

export interface PixCharge {
  providerTransactionId: string;
  qrCode: string;
  qrCodeText: string;
  expiresAt: Date;
}

export interface CreateCardChargeInput {
  orderId: string;
  amount: Cents;
  description: string;
  /** Opaque card token produced by the provider's hosted fields — never a PAN. */
  cardToken: string;
  installments: number;
  idempotencyKey: string;
}

export interface CardCharge {
  providerTransactionId: string;
  status: PspTransactionStatus;
}

export interface RefundInput {
  providerTransactionId: string;
  /** Omit for full refund (FR-PAY-011); partial when supported (FR-PAY-012). */
  amount?: Cents;
  idempotencyKey: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: "pending" | "completed" | "failed";
}

export type PspTransactionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "refunded"
  | "partially_refunded"
  | "charged_back";

export interface PspTransaction {
  providerTransactionId: string;
  status: PspTransactionStatus;
  amount: Cents;
  /** Provider fee, when known — feeds the ledger (FR-PAY-003). */
  providerFee?: Cents;
  /** Expected settlement date, when known (FR-PAY-018). */
  settlementExpectedAt?: Date;
}

export interface WebhookInput {
  headers: Record<string, string>;
  rawBody: string;
}

export interface NormalizedPspEvent {
  /** Provider-side unique event id — deduplication key (FR-PAY-006/007). */
  providerEventId: string;
  providerTransactionId: string;
  type:
    | "payment.approved"
    | "payment.rejected"
    | "payment.expired"
    | "payment.refunded"
    | "payment.charged_back";
  occurredAt: Date;
}
