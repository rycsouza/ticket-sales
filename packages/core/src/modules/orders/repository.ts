import type { PrismaClient } from "@ingressos/db";
import { RESERVATION_TX_OPTIONS, reserveOrderLines } from "../inventory/reservations";
import type {
  OrderItemRecord,
  OrderRecord,
  OrderSearchFilters,
  OrderSearchRow,
  OrderStatus,
} from "./types";

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
  /**
   * Standalone paid add-ons (upsell / order bump). One entry per UNIT; each
   * becomes a PRODUCT order item — no ticket, no inventory reservation.
   */
  products?: { productId: string; description: string; unitPriceCents: number }[];
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
  /**
   * FR-ADM-001 — org-scoped order search for the support console. Bounded by
   * `limit`; most recent first. Free-text matches code/e-mail/name/document.
   */
  searchOrders(organizationId: string, filters: OrderSearchFilters): Promise<OrderSearchRow[]>;
  /**
   * Panel dashboard aggregates (org-scoped): today's revenue/new orders plus
   * lifetime paid/awaiting counters. `since` = start of "today" in the ORG's
   * timezone (resolved by the caller); `now` bounds awaiting to non-expired.
   */
  getDashboardStats(
    organizationId: string,
    params: { since: Date; now: Date },
  ): Promise<{
    revenueTodayCents: number;
    ordersTodayCount: number;
    paidTotalCount: number;
    awaitingCount: number;
  }>;
  listItems(organizationId: string, orderId: string): Promise<OrderItemRecord[]>;
  /**
   * CRM aggregate (EP-08): paid orders grouped by buyer e-mail, optionally
   * scoped to one event. Reproducible from the source of truth (orders).
   */
  aggregatePaidByBuyer(
    organizationId: string,
    eventId?: string,
  ): Promise<{ buyerEmail: string; orderCount: number; totalCents: number }[]>;
  /**
   * DEC-010 (LGPD): replace a buyer's PII across their orders with a pseudonym.
   * The financial ledger references orderId (not PII), so it stays intact.
   */
  anonymizeBuyer(
    organizationId: string,
    email: string,
    pseudonym: { name: string; email: string },
  ): Promise<number>;
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
  kind: true,
  batchId: true,
  ticketTypeId: true,
  productId: true,
  description: true,
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
            create: [
              ...data.units.map((unit) => ({
                organizationId: data.organizationId,
                eventId: data.eventId,
                kind: "TICKET" as const,
                batchId: unit.batchId,
                ticketTypeId: unit.ticketTypeId,
                unitPriceCents: unit.unitPriceCents,
              })),
              // PRODUCT lines: paid add-ons with no ticket and no reservation.
              ...(data.products ?? []).map((product) => ({
                organizationId: data.organizationId,
                eventId: data.eventId,
                kind: "PRODUCT" as const,
                productId: product.productId,
                description: product.description,
                unitPriceCents: product.unitPriceCents,
              })),
            ],
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

  async searchOrders(
    organizationId: string,
    filters: OrderSearchFilters,
  ): Promise<OrderSearchRow[]> {
    const q = filters.q?.trim();
    const rows = await this.prisma.order.findMany({
      where: {
        organizationId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.eventId ? { eventId: filters.eventId } : {}),
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" as const } },
                { buyerEmail: { contains: q, mode: "insensitive" as const } },
                { buyerName: { contains: q, mode: "insensitive" as const } },
                { buyerDocument: { contains: q } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        eventId: true,
        status: true,
        buyerName: true,
        buyerEmail: true,
        totalCents: true,
        createdAt: true,
        paidAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit,
    });
    return rows;
  }

  async getDashboardStats(organizationId: string, params: { since: Date; now: Date }) {
    const PAID_STATUSES = ["PAID", "PARTIALLY_REFUNDED"] as const;
    const [revenue, ordersToday, paidTotal, awaiting] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          organizationId,
          status: { in: [...PAID_STATUSES] },
          paidAt: { gte: params.since },
        },
        _sum: { totalCents: true },
      }),
      this.prisma.order.count({
        where: { organizationId, createdAt: { gte: params.since } },
      }),
      this.prisma.order.count({
        where: { organizationId, status: { in: [...PAID_STATUSES] } },
      }),
      this.prisma.order.count({
        where: {
          organizationId,
          status: "AWAITING_PAYMENT",
          OR: [{ expiresAt: null }, { expiresAt: { gt: params.now } }],
        },
      }),
    ]);
    return {
      revenueTodayCents: revenue._sum.totalCents ?? 0,
      ordersTodayCount: ordersToday,
      paidTotalCount: paidTotal,
      awaitingCount: awaiting,
    };
  }

  async listItems(organizationId: string, orderId: string) {
    return this.prisma.orderItem.findMany({
      where: { organizationId, orderId },
      select: itemSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async aggregatePaidByBuyer(organizationId: string, eventId?: string) {
    const grouped = await this.prisma.order.groupBy({
      by: ["buyerEmail"],
      where: { organizationId, status: "PAID", ...(eventId ? { eventId } : {}) },
      _count: { _all: true },
      _sum: { totalCents: true },
    });
    return grouped.map((row) => ({
      buyerEmail: row.buyerEmail,
      orderCount: row._count._all,
      totalCents: row._sum.totalCents ?? 0,
    }));
  }

  async anonymizeBuyer(
    organizationId: string,
    email: string,
    pseudonym: { name: string; email: string },
  ): Promise<number> {
    const result = await this.prisma.order.updateMany({
      where: { organizationId, buyerEmail: email },
      data: {
        buyerName: pseudonym.name,
        buyerEmail: pseudonym.email,
        buyerPhone: null,
        buyerDocument: null,
      },
    });
    return result.count;
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
