// PRD §11.3
export type PaymentStatus =
  | "CREATED"
  | "PROCESSING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "DISPUTED"
  | "CHARGED_BACK";

export type PaymentMethod = "PIX" | "CARD";

export interface PaymentRecord {
  id: string;
  organizationId: string;
  orderId: string;
  provider: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  providerTransactionId: string | null;
  idempotencyKey: string;
  pixQrCode: string | null;
  pixQrCodeText: string | null;
  expiresAt: Date | null;
  correlationId: string;
}

export type PaymentEventProcessStatus = "RECEIVED" | "PROCESSED" | "IGNORED" | "FAILED";

export interface PaymentEventRecord {
  id: string;
  provider: string;
  providerEventId: string;
  providerTransactionId: string | null;
  type: string;
  status: PaymentEventProcessStatus;
}
