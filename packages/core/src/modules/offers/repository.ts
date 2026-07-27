import type { PrismaClient } from "@ingressos/db";
import type { OfferKind, OfferRecord, ProductRecord } from "./types";

// Every method touching org-owned data REQUIRES organizationId in scope
// (AGENTS.md / CLAUDE_SECURITY_RULES §7). There are no cross-scope reads here.

export interface ProductRepository {
  create(data: {
    organizationId: string;
    name: string;
    description?: string | undefined;
    priceCents: number;
  }): Promise<ProductRecord>;
  findById(organizationId: string, id: string): Promise<ProductRecord | null>;
  listByOrganization(organizationId: string): Promise<ProductRecord[]>;
  update(
    organizationId: string,
    id: string,
    data: {
      name?: string | undefined;
      description?: string | null | undefined;
      priceCents?: number | undefined;
      active?: boolean | undefined;
    },
  ): Promise<ProductRecord | null>;
}

export interface OfferRepository {
  create(data: {
    organizationId: string;
    kind: OfferKind;
    eventId?: string | null | undefined;
    batchId?: string | undefined;
    productId?: string | undefined;
    title?: string | undefined;
    description?: string | undefined;
    priceCentsOverride?: number | undefined;
    sortOrder?: number | undefined;
  }): Promise<OfferRecord>;
  findById(organizationId: string, id: string): Promise<OfferRecord | null>;
  listByOrganization(organizationId: string): Promise<OfferRecord[]>;
  /** Active offers that apply to an event: event-scoped OR org-default (null). */
  listActiveForEvent(organizationId: string, eventId: string): Promise<OfferRecord[]>;
  update(
    organizationId: string,
    id: string,
    data: {
      title?: string | null | undefined;
      description?: string | null | undefined;
      priceCentsOverride?: number | null | undefined;
      sortOrder?: number | undefined;
      active?: boolean | undefined;
    },
  ): Promise<OfferRecord | null>;
}

const productSelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  priceCents: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

const offerSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  kind: true,
  batchId: true,
  productId: true,
  title: true,
  description: true,
  priceCentsOverride: true,
  active: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    name: string;
    description?: string | undefined;
    priceCents: number;
  }): Promise<ProductRecord> {
    return this.prisma.product.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        description: data.description ?? null,
        priceCents: data.priceCents,
      },
      select: productSelect,
    });
  }

  async findById(organizationId: string, id: string): Promise<ProductRecord | null> {
    return this.prisma.product.findFirst({
      where: { id, organizationId },
      select: productSelect,
    });
  }

  async listByOrganization(organizationId: string): Promise<ProductRecord[]> {
    return this.prisma.product.findMany({
      where: { organizationId },
      select: productSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      name?: string | undefined;
      description?: string | null | undefined;
      priceCents?: number | undefined;
      active?: boolean | undefined;
    },
  ): Promise<ProductRecord | null> {
    const result = await this.prisma.product.updateMany({
      where: { id, organizationId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.priceCents !== undefined ? { priceCents: data.priceCents } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
    if (result.count === 0) return null;
    return this.findById(organizationId, id);
  }
}

export class PrismaOfferRepository implements OfferRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    kind: OfferKind;
    eventId?: string | null | undefined;
    batchId?: string | undefined;
    productId?: string | undefined;
    title?: string | undefined;
    description?: string | undefined;
    priceCentsOverride?: number | undefined;
    sortOrder?: number | undefined;
  }): Promise<OfferRecord> {
    return this.prisma.offer.create({
      data: {
        organizationId: data.organizationId,
        kind: data.kind,
        eventId: data.eventId ?? null,
        batchId: data.batchId ?? null,
        productId: data.productId ?? null,
        title: data.title ?? null,
        description: data.description ?? null,
        priceCentsOverride: data.priceCentsOverride ?? null,
        sortOrder: data.sortOrder ?? 0,
      },
      select: offerSelect,
    });
  }

  async findById(organizationId: string, id: string): Promise<OfferRecord | null> {
    return this.prisma.offer.findFirst({
      where: { id, organizationId },
      select: offerSelect,
    });
  }

  async listByOrganization(organizationId: string): Promise<OfferRecord[]> {
    return this.prisma.offer.findMany({
      where: { organizationId },
      select: offerSelect,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  }

  async listActiveForEvent(organizationId: string, eventId: string): Promise<OfferRecord[]> {
    return this.prisma.offer.findMany({
      where: {
        organizationId,
        active: true,
        OR: [{ eventId }, { eventId: null }],
      },
      select: offerSelect,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      title?: string | null | undefined;
      description?: string | null | undefined;
      priceCentsOverride?: number | null | undefined;
      sortOrder?: number | undefined;
      active?: boolean | undefined;
    },
  ): Promise<OfferRecord | null> {
    const result = await this.prisma.offer.updateMany({
      where: { id, organizationId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.priceCentsOverride !== undefined
          ? { priceCentsOverride: data.priceCentsOverride }
          : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
    if (result.count === 0) return null;
    return this.findById(organizationId, id);
  }
}
