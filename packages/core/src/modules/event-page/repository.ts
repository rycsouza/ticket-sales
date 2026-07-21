import type { PrismaClient } from "@ingressos/db";

/** Linha crua da página — `blocks` é `unknown` até o serviço re-validar. */
export interface EventPageRow {
  eventId: string;
  organizationId: string;
  brandColor: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  faviconUrl: string | null;
  backgroundUrl: string | null;
  blocks: unknown;
}

export interface UpsertEventPageData {
  brandColor?: string | null | undefined;
  logoUrl?: string | null | undefined;
  bannerUrl?: string | null | undefined;
  faviconUrl?: string | null | undefined;
  backgroundUrl?: string | null | undefined;
  blocks?: unknown[] | undefined;
}

export interface EventPageRepository {
  findByEvent(organizationId: string, eventId: string): Promise<EventPageRow | null>;
  upsert(
    organizationId: string,
    eventId: string,
    data: UpsertEventPageData,
    defaultBlocks: unknown[],
  ): Promise<EventPageRow>;
}

const pageSelect = {
  eventId: true,
  organizationId: true,
  brandColor: true,
  logoUrl: true,
  bannerUrl: true,
  faviconUrl: true,
  backgroundUrl: true,
  blocks: true,
} as const;

function compact<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export class PrismaEventPageRepository implements EventPageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEvent(organizationId: string, eventId: string): Promise<EventPageRow | null> {
    return this.prisma.eventPage.findFirst({
      where: { eventId, organizationId },
      select: pageSelect,
    });
  }

  async upsert(
    organizationId: string,
    eventId: string,
    data: UpsertEventPageData,
    defaultBlocks: unknown[],
  ): Promise<EventPageRow> {
    const existing = await this.findByEvent(organizationId, eventId);
    if (existing) {
      // eventId é unique, mas o WHERE inclui organizationId mesmo assim —
      // defesa em profundidade contra escrita cross-tenant.
      await this.prisma.eventPage.updateMany({
        where: { eventId, organizationId },
        data: compact({
          brandColor: data.brandColor,
          logoUrl: data.logoUrl,
          bannerUrl: data.bannerUrl,
          faviconUrl: data.faviconUrl,
          backgroundUrl: data.backgroundUrl,
          blocks: data.blocks as object | undefined,
        }),
      });
    } else {
      await this.prisma.eventPage.create({
        data: {
          eventId,
          organizationId,
          brandColor: data.brandColor ?? null,
          logoUrl: data.logoUrl ?? null,
          bannerUrl: data.bannerUrl ?? null,
          faviconUrl: data.faviconUrl ?? null,
          backgroundUrl: data.backgroundUrl ?? null,
          blocks: (data.blocks ?? defaultBlocks) as object,
        },
      });
    }
    const row = await this.findByEvent(organizationId, eventId);
    if (!row) throw new Error("Event page vanished after upsert");
    return row;
  }
}

/**
 * Leitura pública (cross-org) da página — espelha PrismaPublicEventReader:
 * o chamador só chega aqui com um evento já resolvido como PUBLISHED.
 */
export class PrismaPublicEventPageReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEventId(eventId: string): Promise<EventPageRow | null> {
    return this.prisma.eventPage.findUnique({
      where: { eventId },
      select: pageSelect,
    });
  }
}
