// In-memory fakes for events/inventory tests — same org-scoping behavior as
// the Prisma repositories so tenant-isolation tests are meaningful.

import type {
  CreateEventData,
  EventRepository,
  SectorRepository,
  UpdateEventData,
} from "../modules/events/repository";
import type { InventoryReader } from "../modules/events/service";
import type { EventRecord, EventStatus, SectorRecord } from "../modules/events/types";
import type {
  SalesBatchRepository,
  TicketTypeRepository,
} from "../modules/inventory/repository";
import type { EventReader } from "../modules/inventory/service";
import type {
  SalesBatchRecord,
  SalesBatchStatus,
  TicketTypeKind,
  TicketTypeRecord,
} from "../modules/inventory/types";
import { nextId } from "./fakes";

export class InMemoryEventRepository implements EventRepository, EventReader {
  readonly events: EventRecord[] = [];

  async create(data: CreateEventData): Promise<EventRecord> {
    const event: EventRecord = {
      id: nextId("evt"),
      organizationId: data.organizationId,
      status: "DRAFT",
      title: data.title,
      slug: data.slug,
      description: data.description ?? null,
      venueName: data.venueName ?? null,
      addressLine: data.addressLine ?? null,
      city: data.city ?? null,
      state: data.state ?? null,
      timezone: data.timezone,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      capacityTotal: data.capacityTotal ?? null,
      salesStartAt: data.salesStartAt ?? null,
      salesEndAt: data.salesEndAt ?? null,
      ageRating: data.ageRating ?? null,
      cancellationPolicy: data.cancellationPolicy ?? null,
      eventTerms: data.eventTerms ?? null,
      maxTicketsPerOrder: data.maxTicketsPerOrder ?? null,
      platformFeeBps: data.platformFeeBps ?? 0,
      feeMode: data.feeMode ?? "PRODUCER",
      publishedAt: null,
    };
    this.events.push(event);
    return event;
  }

  async findByIdScoped(organizationId: string, eventId: string) {
    return (
      this.events.find((e) => e.id === eventId && e.organizationId === organizationId) ?? null
    );
  }

  async findBySlug(organizationId: string, slug: string) {
    return (
      this.events.find((e) => e.slug === slug && e.organizationId === organizationId) ?? null
    );
  }

  async findAnyBySlug(slug: string) {
    return this.events.find((e) => e.slug === slug) ?? null;
  }

  async listByOrganization(organizationId: string) {
    return this.events.filter((e) => e.organizationId === organizationId);
  }

  async updateDetails(organizationId: string, eventId: string, data: UpdateEventData) {
    const event = await this.mustFind(organizationId, eventId);
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) (event as unknown as Record<string, unknown>)[key] = value;
    }
    return event;
  }

  async updateStatus(
    organizationId: string,
    eventId: string,
    status: EventStatus,
    fields?: { publishedAt?: Date; cancelledAt?: Date },
  ) {
    const event = await this.mustFind(organizationId, eventId);
    event.status = status;
    if (fields?.publishedAt) event.publishedAt = fields.publishedAt;
    return event;
  }

  async updateCapacity(organizationId: string, eventId: string, capacityTotal: number) {
    const event = await this.mustFind(organizationId, eventId);
    event.capacityTotal = capacityTotal;
    return event;
  }

  private async mustFind(organizationId: string, eventId: string): Promise<EventRecord> {
    const event = await this.findByIdScoped(organizationId, eventId);
    if (!event) throw new Error("Event not found in organization scope");
    return event;
  }
}

export class InMemorySectorRepository implements SectorRepository {
  readonly sectors: SectorRecord[] = [];

  async create(data: {
    organizationId: string;
    eventId: string;
    name: string;
    capacity?: number | undefined;
  }): Promise<SectorRecord> {
    const sector: SectorRecord = {
      id: nextId("sec"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      name: data.name,
      capacity: data.capacity ?? null,
    };
    this.sectors.push(sector);
    return sector;
  }

  async findByEventAndName(organizationId: string, eventId: string, name: string) {
    return (
      this.sectors.find(
        (s) => s.organizationId === organizationId && s.eventId === eventId && s.name === name,
      ) ?? null
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.sectors.filter(
      (s) => s.organizationId === organizationId && s.eventId === eventId,
    );
  }
}

export class InMemoryTicketTypeRepository implements TicketTypeRepository {
  readonly ticketTypes: TicketTypeRecord[] = [];

  async create(data: {
    organizationId: string;
    eventId: string;
    name: string;
    kind: TicketTypeKind;
    sectorId?: string | undefined;
  }): Promise<TicketTypeRecord> {
    const ticketType: TicketTypeRecord = {
      id: nextId("tkt"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      sectorId: data.sectorId ?? null,
      kind: data.kind,
      active: true,
      name: data.name,
    };
    this.ticketTypes.push(ticketType);
    return ticketType;
  }

  async findByIdScoped(organizationId: string, ticketTypeId: string) {
    return (
      this.ticketTypes.find(
        (t) => t.id === ticketTypeId && t.organizationId === organizationId,
      ) ?? null
    );
  }

  async findByEventAndName(organizationId: string, eventId: string, name: string) {
    return (
      this.ticketTypes.find(
        (t) => t.organizationId === organizationId && t.eventId === eventId && t.name === name,
      ) ?? null
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.ticketTypes.filter(
      (t) => t.organizationId === organizationId && t.eventId === eventId,
    );
  }
}

export class InMemorySalesBatchRepository implements SalesBatchRepository, InventoryReader {
  readonly batches: SalesBatchRecord[] = [];

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
  }): Promise<SalesBatchRecord> {
    const batch: SalesBatchRecord = {
      id: nextId("bat"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      ticketTypeId: data.ticketTypeId,
      status: "SCHEDULED",
      name: data.name,
      priceCents: data.priceCents,
      quantityTotal: data.quantityTotal,
      quantitySold: 0,
      quantityReserved: 0,
      salesStartAt: data.salesStartAt ?? null,
      salesEndAt: data.salesEndAt ?? null,
      maxPerOrder: data.maxPerOrder ?? null,
    };
    this.batches.push(batch);
    return batch;
  }

  async findByIdScoped(organizationId: string, batchId: string) {
    return (
      this.batches.find((b) => b.id === batchId && b.organizationId === organizationId) ?? null
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.batches.filter(
      (b) => b.organizationId === organizationId && b.eventId === eventId,
    );
  }

  async sumQuantityTotalByEvent(organizationId: string, eventId: string, excludeBatchId?: string) {
    return this.batches
      .filter(
        (b) =>
          b.organizationId === organizationId &&
          b.eventId === eventId &&
          b.id !== excludeBatchId,
      )
      .reduce((sum, b) => sum + b.quantityTotal, 0);
  }

  async sumCommittedByEvent(organizationId: string, eventId: string) {
    return this.batches
      .filter((b) => b.organizationId === organizationId && b.eventId === eventId)
      .reduce((sum, b) => sum + b.quantitySold + b.quantityReserved, 0);
  }

  async countByEvent(organizationId: string, eventId: string) {
    return this.batches.filter(
      (b) => b.organizationId === organizationId && b.eventId === eventId,
    ).length;
  }

  async updateQuantityTotal(organizationId: string, batchId: string, quantityTotal: number) {
    const batch = await this.mustFind(organizationId, batchId);
    batch.quantityTotal = quantityTotal;
    return batch;
  }

  async updateStatus(organizationId: string, batchId: string, status: SalesBatchStatus) {
    const batch = await this.mustFind(organizationId, batchId);
    batch.status = status;
    return batch;
  }

  // InventoryReader (events module view)
  async sumBatchQuantityTotal(organizationId: string, eventId: string) {
    return this.sumQuantityTotalByEvent(organizationId, eventId);
  }

  async sumBatchCommitted(organizationId: string, eventId: string) {
    return this.sumCommittedByEvent(organizationId, eventId);
  }

  async countBatches(organizationId: string, eventId: string) {
    return this.countByEvent(organizationId, eventId);
  }

  private async mustFind(organizationId: string, batchId: string): Promise<SalesBatchRecord> {
    const batch = await this.findByIdScoped(organizationId, batchId);
    if (!batch) throw new Error("Batch not found in organization scope");
    return batch;
  }
}
