import type { PrismaClient } from "@ingressos/db";
import type { EventRecord, EventStatus, FeeMode, SectorRecord } from "./types";

export interface CreateEventData {
  organizationId: string;
  title: string;
  slug: string;
  description?: string | undefined;
  venueName?: string | undefined;
  addressLine?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  timezone: string;
  startsAt?: Date | undefined;
  endsAt?: Date | undefined;
  capacityTotal?: number | undefined;
  salesStartAt?: Date | undefined;
  salesEndAt?: Date | undefined;
  ageRating?: string | undefined;
  cancellationPolicy?: string | undefined;
  eventTerms?: string | undefined;
  maxTicketsPerOrder?: number | undefined;
  platformFeeBps?: number | undefined;
  feeMode?: FeeMode | undefined;
}

export type UpdateEventData = {
  [K in keyof Omit<CreateEventData, "organizationId" | "slug">]?:
    | Omit<CreateEventData, "organizationId" | "slug">[K]
    | undefined;
};

export interface EventRepository {
  create(data: CreateEventData): Promise<EventRecord>;
  findByIdScoped(organizationId: string, eventId: string): Promise<EventRecord | null>;
  findBySlug(organizationId: string, slug: string): Promise<EventRecord | null>;
  /** Global (cross-org) slug lookup — slugs are globally unique for the public URL. */
  findAnyBySlug(slug: string): Promise<EventRecord | null>;
  listByOrganization(organizationId: string): Promise<EventRecord[]>;
  updateDetails(
    organizationId: string,
    eventId: string,
    data: UpdateEventData,
  ): Promise<EventRecord>;
  updateStatus(
    organizationId: string,
    eventId: string,
    status: EventStatus,
    fields?: { publishedAt?: Date; cancelledAt?: Date },
  ): Promise<EventRecord>;
  updateCapacity(
    organizationId: string,
    eventId: string,
    capacityTotal: number,
  ): Promise<EventRecord>;
}

export interface SectorRepository {
  create(data: {
    organizationId: string;
    eventId: string;
    name: string;
    capacity?: number | undefined;
  }): Promise<SectorRecord>;
  findByEventAndName(
    organizationId: string,
    eventId: string,
    name: string,
  ): Promise<SectorRecord | null>;
  listByEvent(organizationId: string, eventId: string): Promise<SectorRecord[]>;
}

// ---------------------------------------------------------------------------
// Prisma implementations
// ---------------------------------------------------------------------------

const eventSelect = {
  id: true,
  organizationId: true,
  status: true,
  title: true,
  slug: true,
  description: true,
  venueName: true,
  addressLine: true,
  city: true,
  state: true,
  timezone: true,
  startsAt: true,
  endsAt: true,
  capacityTotal: true,
  salesStartAt: true,
  salesEndAt: true,
  ageRating: true,
  cancellationPolicy: true,
  eventTerms: true,
  maxTicketsPerOrder: true,
  platformFeeBps: true,
  feeMode: true,
  publishedAt: true,
} as const;

const sectorSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  name: true,
  capacity: true,
} as const;

function compact<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export class PrismaEventRepository implements EventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateEventData): Promise<EventRecord> {
    return this.prisma.event.create({
      data: {
        organizationId: data.organizationId,
        title: data.title,
        slug: data.slug,
        timezone: data.timezone,
        ...compact({
          description: data.description,
          venueName: data.venueName,
          addressLine: data.addressLine,
          city: data.city,
          state: data.state,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          capacityTotal: data.capacityTotal,
          salesStartAt: data.salesStartAt,
          salesEndAt: data.salesEndAt,
          ageRating: data.ageRating,
          cancellationPolicy: data.cancellationPolicy,
          eventTerms: data.eventTerms,
          maxTicketsPerOrder: data.maxTicketsPerOrder,
          platformFeeBps: data.platformFeeBps,
          feeMode: data.feeMode,
        }),
      },
      select: eventSelect,
    });
  }

  async findByIdScoped(organizationId: string, eventId: string) {
    return this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
      select: eventSelect,
    });
  }

  async findBySlug(organizationId: string, slug: string) {
    return this.prisma.event.findFirst({
      where: { organizationId, slug },
      select: eventSelect,
    });
  }

  async findAnyBySlug(slug: string) {
    return this.prisma.event.findUnique({ where: { slug }, select: eventSelect });
  }

  async listByOrganization(organizationId: string) {
    return this.prisma.event.findMany({
      where: { organizationId },
      select: eventSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async updateDetails(organizationId: string, eventId: string, data: UpdateEventData) {
    const result = await this.prisma.event.updateMany({
      where: { id: eventId, organizationId },
      data: compact(data),
    });
    if (result.count === 0) throw new Error("Event not found in organization scope");
    return this.mustFind(organizationId, eventId);
  }

  async updateStatus(
    organizationId: string,
    eventId: string,
    status: EventStatus,
    fields?: { publishedAt?: Date; cancelledAt?: Date },
  ) {
    const result = await this.prisma.event.updateMany({
      where: { id: eventId, organizationId },
      data: { status, ...compact({ ...fields }) },
    });
    if (result.count === 0) throw new Error("Event not found in organization scope");
    return this.mustFind(organizationId, eventId);
  }

  async updateCapacity(organizationId: string, eventId: string, capacityTotal: number) {
    const result = await this.prisma.event.updateMany({
      where: { id: eventId, organizationId },
      data: { capacityTotal },
    });
    if (result.count === 0) throw new Error("Event not found in organization scope");
    return this.mustFind(organizationId, eventId);
  }

  private async mustFind(organizationId: string, eventId: string): Promise<EventRecord> {
    const event = await this.findByIdScoped(organizationId, eventId);
    if (!event) throw new Error("Event vanished after update");
    return event;
  }
}

/**
 * Cross-org PUBLIC event access — deliberately outside the org-scoped
 * repository: only PUBLISHED events are ever visible through here, and the
 * event row itself is the tenant anchor for the public sales flow.
 */
export class PrismaPublicEventReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findPublishedById(eventId: string): Promise<EventRecord | null> {
    return this.prisma.event.findFirst({
      where: { id: eventId, status: "PUBLISHED" },
      select: eventSelect,
    });
  }

  async findPublishedBySlug(slug: string): Promise<EventRecord | null> {
    return this.prisma.event.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: eventSelect,
    });
  }
}

export class PrismaSectorRepository implements SectorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    eventId: string;
    name: string;
    capacity?: number | undefined;
  }) {
    return this.prisma.sector.create({
      data: {
        organizationId: data.organizationId,
        eventId: data.eventId,
        name: data.name,
        capacity: data.capacity ?? null,
      },
      select: sectorSelect,
    });
  }

  async findByEventAndName(organizationId: string, eventId: string, name: string) {
    return this.prisma.sector.findFirst({
      where: { organizationId, eventId, name },
      select: sectorSelect,
    });
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.prisma.sector.findMany({
      where: { organizationId, eventId },
      select: sectorSelect,
      orderBy: { name: "asc" },
    });
  }
}
