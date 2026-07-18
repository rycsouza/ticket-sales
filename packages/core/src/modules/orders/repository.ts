import type { PrismaClient } from "@ingressos/db";
import { RESERVATION_TX_OPTIONS, reserveOrderLines } from "../inventory/reservations";
import type { OrderItemRecord, OrderRecord, OrderStatus } from "./types";

export interface CreatePendingOrderData {
  organizationId: string;
  eventId: string;
  code: string;
  buyerName: string;
  buyerEmail: string;
  buyerDocument?: string | undefined;
  buyerPhone?: string | undefined;
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  feeMode: "BUYER" | "PRODUCER";
  totalCents: number;
  expiresAt: Date;
  correlationId: string;
  /** One entry per UNIT (each becomes a ticket). */
  units: { batchId: string; ticketTypeId: string; unitPriceCents: number }[];
}

export interface OrderRepository {
  /**
   * Creates order + items and reserves inventory ATOMICALLY (all-or-nothing):
   * when any batch lacks availability, nothing is persisted and
   * NoAvailabilityError propagates (FR-INV-008, BR-INV-002).
   */
  createPendingOrder(data: CreatePendingOrderData): Promise<OrderRecord>;
  findByIdScoped(organizationId: string, orderId: string): Promise<OrderRecord | null>;
  /** Public lookup — the code is the capability; caller must also match email. */
  findByCode(code: string): Promise<OrderRecord | null>;
  listItems(organizationId: string, orderId: string): Promise<OrderItemRecord[]>;
  /**
   * Guarded transition: succeeds only when the current status is in `from`.
   * Returns false otherwise (idempotency primitive, NFR-REL-001).
   */
  transitionStatus(
    organizationId: string,
    orderId: string,
    from: OrderStatus[],
    to: OrderStatus,
    fields?: { paidAt?: Date; cancelledAt?: Date; refundedAt?: Date },
  ): Promise<boolean>;
}

const orderSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  status: true,
  code: true,
  buyerName: true,
  buyerEmail: true,
  buyerDocument: true,
  buyerPhone: true,
  subtotalCents: true,
  discountCents: true,
  feeCents: true,
  feeMode: true,
  totalCents: true,
  expiresAt: true,
  paidAt: true,
  correlationId: true,
} as const;

const itemSelect = {
  id: true,
  organizationId: true,
  orderId: true,
  eventId: true,
  batchId: true,
  ticketTypeId: true,
  unitPriceCents: true,
} as const;

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createPendingOrder(data: CreatePendingOrderData): Promise<OrderRecord> {
    // Group units per batch for the reservation counters
    const lines = new Map<string, number>();
    for (const unit of data.units) {
      lines.set(unit.batchId, (lines.get(unit.batchId) ?? 0) + 1);
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          organizationId: data.organizationId,
          eventId: data.eventId,
          status: "AWAITING_PAYMENT",
          code: data.code,
          buyerName: data.buyerName,
          buyerEmail: data.buyerEmail,
          buyerDocument: data.buyerDocument ?? null,
          buyerPhone: data.buyerPhone ?? null,
          subtotalCents: data.subtotalCents,
          discountCents: data.discountCents,
          feeCents: data.feeCents,
          feeMode: data.feeMode,
          totalCents: data.totalCents,
          expiresAt: data.expiresAt,
          correlationId: data.correlationId,
          items: {
            create: data.units.map((unit) => ({
              organizationId: data.organizationId,
              eventId: data.eventId,
              batchId: unit.batchId,
              ticketTypeId: unit.ticketTypeId,
              unitPriceCents: unit.unitPriceCents,
            })),
          },
        },
        select: orderSelect,
      });

      // Same transaction as the order: NoAvailabilityError rolls back the
      // order and items too (all-or-nothing, BR-INV-002).
      await reserveOrderLines(tx, {
        organizationId: data.organizationId,
        eventId: data.eventId,
        orderId: order.id,
        expiresAt: data.expiresAt,
        lines: [...lines.entries()].map(([batchId, quantity]) => ({ batchId, quantity })),
      });

      return order;
    }, RESERVATION_TX_OPTIONS);
  }

  async findByIdScoped(organizationId: string, orderId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, organizationId },
      select: orderSelect,
    });
  }

  async findByCode(code: string) {
    return this.prisma.order.findUnique({ where: { code }, select: orderSelect });
  }

  async listItems(organizationId: string, orderId: string) {
    return this.prisma.orderItem.findMany({
      where: { organizationId, orderId },
      select: itemSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async transitionStatus(
    organizationId: string,
    orderId: string,
    from: OrderStatus[],
    to: OrderStatus,
    fields?: { paidAt?: Date; cancelledAt?: Date; refundedAt?: Date },
  ): Promise<boolean> {
    const result = await this.prisma.order.updateMany({
      where: { id: orderId, organizationId, status: { in: from } },
      data: {
        status: to,
        ...(fields?.paidAt !== undefined ? { paidAt: fields.paidAt } : {}),
        ...(fields?.cancelledAt !== undefined ? { cancelledAt: fields.cancelledAt } : {}),
        ...(fields?.refundedAt !== undefined ? { refundedAt: fields.refundedAt } : {}),
      },
    });
    return result.count > 0;
  }
}
