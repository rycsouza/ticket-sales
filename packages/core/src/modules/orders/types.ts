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

export interface OrderItemRecord {
  id: string;
  organizationId: string;
  orderId: string;
  eventId: string;
  batchId: string;
  ticketTypeId: string;
  unitPriceCents: number;
}

/** How long a checkout holds inventory before expiring (FR-INV-005). */
export const RESERVATION_TTL_MINUTES = 5;
