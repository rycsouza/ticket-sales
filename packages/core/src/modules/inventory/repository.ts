import type { PrismaClient } from "@ingressos/db";
import type {
  SalesBatchRecord,
  SalesBatchStatus,
  TicketTypeKind,
  TicketTypeRecord,
} from "./types";

export interface TicketTypeRepository {
  create(data: {
    organizationId: string;
    eventId: string;
    name: string;
    kind: TicketTypeKind;
    sectorId?: string | undefined;
  }): Promise<TicketTypeRecord>;
  findByIdScoped(organizationId: string, ticketTypeId: string): Promise<TicketTypeRecord | null>;
  findByEventAndName(
    organizationId: string,
    eventId: string,
    name: string,
  ): Promise<TicketTypeRecord | null>;
  listByEvent(organizationId: string, eventId: string): Promise<TicketTypeRecord[]>;
}

export interface SalesBatchRepository {
  create(data: {
    organizationId: string;
    eventId: string;
    ticketTypeId: string;
    name: string;
    priceCents: number;
    quantityTotal: number;
    salesStartAt?: Date | undefined;
    salesEndAt?: Date | undefined;
    maxPerOrder?: number | undefined;
  }): Promise<SalesBatchRecord>;
  findByIdScoped(organizationId: string, batchId: string): Promise<SalesBatchRecord | null>;
  listByEvent(organizationId: string, eventId: string): Promise<SalesBatchRecord[]>;
  sumQuantityTotalByEvent(
    organizationId: string,
    eventId: string,
    excludeBatchId?: string,
  ): Promise<number>;
  sumCommittedByEvent(organizationId: string, eventId: string): Promise<number>;
  countByEvent(organizationId: string, eventId: string): Promise<number>;
  updateQuantityTotal(
    organizationId: string,
    batchId: string,
    quantityTotal: number,
  ): Promise<SalesBatchRecord>;
  updateStatus(
    organizationId: string,
    batchId: string,
    status: SalesBatchStatus,
  ): Promise<SalesBatchRecord>;
}

// ---------------------------------------------------------------------------
// Prisma implementations
// ---------------------------------------------------------------------------

const ticketTypeSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  sectorId: true,
  kind: true,
  active: true,
  name: true,
} as const;

const batchSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  ticketTypeId: true,
  status: true,
  name: true,
  priceCents: true,
  quantityTotal: true,
  quantitySold: true,
  quantityReserved: true,
  salesStartAt: true,
  salesEndAt: true,
  maxPerOrder: true,
} as const;

export class PrismaTicketTypeRepository implements TicketTypeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    eventId: string;
    name: string;
    kind: TicketTypeKind;
    sectorId?: string | undefined;
  }) {
    return this.prisma.ticketType.create({
      data: {
        organizationId: data.organizationId,
        eventId: data.eventId,
        name: data.name,
        kind: data.kind,
        sectorId: data.sectorId ?? null,
      },
      select: ticketTypeSelect,
    });
  }

  async findByIdScoped(organizationId: string, ticketTypeId: string) {
    return this.prisma.ticketType.findFirst({
      where: { id: ticketTypeId, organizationId },
      select: ticketTypeSelect,
    });
  }

  async findByEventAndName(organizationId: string, eventId: string, name: string) {
    return this.prisma.ticketType.findFirst({
      where: { organizationId, eventId, name },
      select: ticketTypeSelect,
    });
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.prisma.ticketType.findMany({
      where: { organizationId, eventId },
      select: ticketTypeSelect,
      orderBy: { name: "asc" },
    });
  }
}

export class PrismaSalesBatchRepository implements SalesBatchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    eventId: string;
    ticketTypeId: string;
    name: string;
    priceCents: number;
    quantityTotal: number;
    salesStartAt?: Date | undefined;
    salesEndAt?: Date | undefined;
    maxPerOrder?: number | undefined;
  }) {
    return this.prisma.salesBatch.create({
      data: {
        organizationId: data.organizationId,
        eventId: data.eventId,
        ticketTypeId: data.ticketTypeId,
        name: data.name,
        priceCents: data.priceCents,
        quantityTotal: data.quantityTotal,
        salesStartAt: data.salesStartAt ?? null,
        salesEndAt: data.salesEndAt ?? null,
        maxPerOrder: data.maxPerOrder ?? null,
      },
      select: batchSelect,
    });
  }

  async findByIdScoped(organizationId: string, batchId: string) {
    return this.prisma.salesBatch.findFirst({
      where: { id: batchId, organizationId },
      select: batchSelect,
    });
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.prisma.salesBatch.findMany({
      where: { organizationId, eventId },
      select: batchSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async sumQuantityTotalByEvent(organizationId: string, eventId: string, excludeBatchId?: string) {
    const result = await this.prisma.salesBatch.aggregate({
      where: {
        organizationId,
        eventId,
        ...(excludeBatchId ? { id: { not: excludeBatchId } } : {}),
      },
      _sum: { quantityTotal: true },
    });
    return result._sum.quantityTotal ?? 0;
  }

  async sumCommittedByEvent(organizationId: string, eventId: string) {
    const result = await this.prisma.salesBatch.aggregate({
      where: { organizationId, eventId },
      _sum: { quantitySold: true, quantityReserved: true },
    });
    return (result._sum.quantitySold ?? 0) + (result._sum.quantityReserved ?? 0);
  }

  async countByEvent(organizationId: string, eventId: string) {
    return this.prisma.salesBatch.count({ where: { organizationId, eventId } });
  }

  async updateQuantityTotal(organizationId: string, batchId: string, quantityTotal: number) {
    const result = await this.prisma.salesBatch.updateMany({
      where: { id: batchId, organizationId },
      data: { quantityTotal },
    });
    if (result.count === 0) throw new Error("Batch not found in organization scope");
    return this.mustFind(organizationId, batchId);
  }

  async updateStatus(organizationId: string, batchId: string, status: SalesBatchStatus) {
    const result = await this.prisma.salesBatch.updateMany({
      where: { id: batchId, organizationId },
      data: { status },
    });
    if (result.count === 0) throw new Error("Batch not found in organization scope");
    return this.mustFind(organizationId, batchId);
  }

  private async mustFind(organizationId: string, batchId: string): Promise<SalesBatchRecord> {
    const batch = await this.findByIdScoped(organizationId, batchId);
    if (!batch) throw new Error("Batch vanished after update");
    return batch;
  }
}
