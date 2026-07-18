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
export const RESERVATION_TTL_MINUTES = 15;
