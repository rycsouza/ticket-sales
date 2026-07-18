import type { PrismaClient } from "@ingressos/db";
import type {
  PaymentEventProcessStatus,
  PaymentEventRecord,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
} from "./types";

export interface PaymentRepository {
  create(data: {
    organizationId: string;
    orderId: string;
    provider: string;
    method: PaymentMethod;
    amountCents: number;
    idempotencyKey: string;
    providerTransactionId?: string | undefined;
    pixQrCode?: string | undefined;
    pixQrCodeText?: string | undefined;
    expiresAt?: Date | undefined;
    correlationId: string;
  }): Promise<PaymentRecord>;
  findByProviderTransactionId(providerTransactionId: string): Promise<PaymentRecord | null>;
  findReusablePixForOrder(
    organizationId: string,
    orderId: string,
    now: Date,
  ): Promise<PaymentRecord | null>;
  countByOrder(organizationId: string, orderId: string): Promise<number>;
  /** All payments of an order (support timeline — FR-ADM-002). */
  listByOrder(organizationId: string, orderId: string): Promise<PaymentRecord[]>;
  /** Guarded transition — idempotency primitive for webhook processing. */
  transitionStatus(
    paymentId: string,
    from: PaymentStatus[],
    to: PaymentStatus,
    fields?: { approvedAt?: Date; providerFeeCents?: number },
  ): Promise<boolean>;
}

export interface PaymentEventRepository {
  /**
   * Claims the event for processing. Returns null when the event was already
   * PROCESSED or IGNORED (true duplicate); returns the record when it is new
   * OR previously FAILED (safe to reprocess — every effect is idempotent).
   */
  claim(data: {
    provider: string;
    providerEventId: string;
    providerTransactionId?: string | undefined;
    type: string;
    payload: unknown;
    correlationId: string;
  }): Promise<PaymentEventRecord | null>;
  markOutcome(
    id: string,
    status: Extract<PaymentEventProcessStatus, "PROCESSED" | "IGNORED" | "FAILED">,
    error?: string,
  ): Promise<void>;
}

const paymentSelect = {
  id: true,
  organizationId: true,
  orderId: true,
  provider: true,
  method: true,
  status: true,
  amountCents: true,
  providerTransactionId: true,
  idempotencyKey: true,
  pixQrCode: true,
  pixQrCodeText: true,
  expiresAt: true,
  correlationId: true,
} as const;

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    orderId: string;
    provider: string;
    method: PaymentMethod;
    amountCents: number;
    idempotencyKey: string;
    providerTransactionId?: string | undefined;
    pixQrCode?: string | undefined;
    pixQrCodeText?: string | undefined;
    expiresAt?: Date | undefined;
    correlationId: string;
  }): Promise<PaymentRecord> {
    return this.prisma.payment.create({
      data: {
        organizationId: data.organizationId,
        orderId: data.orderId,
        provider: data.provider,
        method: data.method,
        amountCents: data.amountCents,
        idempotencyKey: data.idempotencyKey,
        providerTransactionId: data.providerTransactionId ?? null,
        pixQrCode: data.pixQrCode ?? null,
        pixQrCodeText: data.pixQrCodeText ?? null,
        expiresAt: data.expiresAt ?? null,
        correlationId: data.correlationId,
      },
      select: paymentSelect,
    });
  }

  async findByProviderTransactionId(providerTransactionId: string) {
    return this.prisma.payment.findUnique({
      where: { providerTransactionId },
      select: paymentSelect,
    });
  }

  async findReusablePixForOrder(organizationId: string, orderId: string, now: Date) {
    return this.prisma.payment.findFirst({
      where: {
        organizationId,
        orderId,
        method: "PIX",
        status: { in: ["CREATED", "PROCESSING"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: paymentSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async countByOrder(organizationId: string, orderId: string) {
    return this.prisma.payment.count({ where: { organizationId, orderId } });
  }

  async listByOrder(organizationId: string, orderId: string) {
    return this.prisma.payment.findMany({
      where: { organizationId, orderId },
      select: paymentSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async transitionStatus(
    paymentId: string,
    from: PaymentStatus[],
    to: PaymentStatus,
    fields?: { approvedAt?: Date; providerFeeCents?: number },
  ): Promise<boolean> {
    const result = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: { in: from } },
      data: {
        status: to,
        ...(fields?.approvedAt !== undefined ? { approvedAt: fields.approvedAt } : {}),
        ...(fields?.providerFeeCents !== undefined
          ? { providerFeeCents: fields.providerFeeCents }
          : {}),
      },
    });
    return result.count > 0;
  }
}

const eventSelect = {
  id: true,
  provider: true,
  providerEventId: true,
  providerTransactionId: true,
  type: true,
  status: true,
} as const;

export class PrismaPaymentEventRepository implements PaymentEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(data: {
    provider: string;
    providerEventId: string;
    providerTransactionId?: string | undefined;
    type: string;
    payload: unknown;
    correlationId: string;
  }): Promise<PaymentEventRecord | null> {
    try {
      return await this.prisma.paymentEvent.create({
        data: {
          provider: data.provider,
          providerEventId: data.providerEventId,
          providerTransactionId: data.providerTransactionId ?? null,
          type: data.type,
          payload: data.payload as object,
          correlationId: data.correlationId,
        },
        select: eventSelect,
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "P2002"
      ) {
        // Already seen. Reprocess ONLY when the previous attempt failed —
        // effects are idempotent, so a retry is safe (FR-ADM-008).
        const existing = await this.prisma.paymentEvent.findUnique({
          where: { providerEventId: data.providerEventId },
          select: eventSelect,
        });
        if (existing && (existing.status === "FAILED" || existing.status === "RECEIVED")) {
          return existing;
        }
        return null;
      }
      throw error;
    }
  }

  async markOutcome(
    id: string,
    status: "PROCESSED" | "IGNORED" | "FAILED",
    error?: string,
  ): Promise<void> {
    await this.prisma.paymentEvent.update({
      where: { id },
      data: { status, error: error ?? null, processedAt: new Date() },
    });
  }
}
