// PRD §11.2
export type OrderStatus =
  | "CREATED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "EXPIRED"
  | "CANCELLED"
  | "CHARGEBACK";

/** DEC-003 — who absorbs the platform fee (snapshot on the order). */
export type OrderFeeMode = "BUYER" | "PRODUCER";

export interface OrderRecord {
  id: string;
  organizationId: string;
  eventId: string;
  status: OrderStatus;
  code: string;
  buyerName: string;
  buyerEmail: string;
  buyerDocument: string | null;
  buyerPhone: string | null;
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  feeMode: OrderFeeMode;
  totalCents: number;
  expiresAt: Date | null;
  paidAt: Date | null;
  correlationId: string;
}

/**
 * FR-ADM-001 — lightweight row for the support order-search list. Never widens
 * the order projection: only what an operator needs to find and open an order.
 */
export interface OrderSearchRow {
  id: string;
  code: string;
  eventId: string;
  status: OrderStatus;
  buyerName: string;
  buyerEmail: string;
  totalCents: number;
  createdAt: Date;
  paidAt: Date | null;
}

export interface OrderSearchFilters {
  /** Free text: matches order code, buyer e-mail, buyer name or document. */
  q?: string | undefined;
  status?: OrderStatus | undefined;
  eventId?: string | undefined;
  limit: number;
}

export type OrderItemKind = "TICKET" | "PRODUCT";

export interface OrderItemRecord {
  id: string;
  organizationId: string;
  orderId: string;
  eventId: string;
  kind: OrderItemKind;
  /** Set for TICKET lines; null for PRODUCT lines. */
  batchId: string | null;
  ticketTypeId: string | null;
  /** Set for PRODUCT lines; null for TICKET lines. */
  productId: string | null;
  /** Snapshot of the product name at purchase time; null for TICKET lines. */
  description: string | null;
  unitPriceCents: number;
}

/**
 * How long a checkout holds inventory before expiring (FR-INV-005).
 *
 * This is ALSO the Pix charge window: the Pix `date_of_expiration` is set to the
 * order's `expiresAt` (payments.chargePix). Mercado Pago automatically REFUNDS a
 * Pix payment that arrives after `date_of_expiration`, so this must be generous
 * enough that a real buyer (open bank app → copy code → confirm → PSP settles)
 * pays well within it. A short window (e.g. 5 min) makes legitimate payments land
 * after expiry and get auto-refunded. Keep reservation and Pix window equal so a
 * payment is never accepted after the hold was already released.
 */
export const RESERVATION_TTL_MINUTES = 30;
