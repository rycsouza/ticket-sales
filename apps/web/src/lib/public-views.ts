import "server-only";

import { defaultPageBlocks, parseStoredBlocks, type EventRecord, type PageBlock } from "@ingressos/core";
import { getServices } from "./services";

export interface PublicBatchView {
  id: string;
  name: string;
  ticketTypeName: string;
  priceCents: number;
  available: boolean;
  maxPerOrder: number | null;
}

/** Personalização da página (identidade visual + blocos) — allowlist pública. */
export interface PublicEventPageView {
  brandColor: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  faviconUrl: string | null;
  blocks: PageBlock[];
}

/** FR-ORG-009 — identidade pública do produtor (bloco "organizer"). */
export interface PublicOrganizerView {
  publicName: string | null;
  logoUrl: string | null;
}

export interface PublicEventView {
  id: string;
  title: string;
  description: string | null;
  venueName: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  timezone: string;
  startsAt: Date | null;
  endsAt: Date | null;
  ageRating: string | null;
  cancellationPolicy: string | null;
  eventTerms: string | null;
  maxTicketsPerOrder: number | null;
  // DEC-003: when feeMode is BUYER, the checkout adds this fee on top of the
  // ticket value and must show it before payment (FR-CHK-004).
  platformFeeBps: number;
  feeMode: "BUYER" | "PRODUCER";
  batches: PublicBatchView[];
  page: PublicEventPageView;
  organizer: PublicOrganizerView | null;
}

/**
 * Curated public view of a PUBLISHED event (FR-CHK-001..003). Shared by the
 * JSON API and the SSR page so both expose exactly the same allowlist —
 * internal counters and organization data never leave the server.
 */
export async function getPublicEventView(eventId: string): Promise<PublicEventView | null> {
  const event = await getServices().publicEvents.findPublishedById(eventId);
  return event ? buildPublicEventView(event) : null;
}

/** Resolve a published event by its globally-unique public slug (/evento/<slug>). */
export async function getPublicEventViewBySlug(slug: string): Promise<PublicEventView | null> {
  const event = await getServices().publicEvents.findPublishedBySlug(slug);
  return event ? buildPublicEventView(event) : null;
}

async function buildPublicEventView(event: EventRecord): Promise<PublicEventView> {
  const services = getServices();
  const now = new Date();
  const [batches, ticketTypes, pageRow, organizerIdentity] = await Promise.all([
    services.batchesRepo.listByEvent(event.organizationId, event.id),
    services.ticketTypesRepo.listByEvent(event.organizationId, event.id),
    services.publicEventPages.findByEventId(event.id),
    services.publicOrganizations.findIdentityById(event.organizationId),
  ]);
  const typeNames = new Map(ticketTypes.map((t) => [t.id, t.name]));

  const visibleBatches: PublicBatchView[] = batches
    .filter((batch) => batch.status === "OPEN" || batch.status === "SOLD_OUT")
    .filter(
      (batch) =>
        (!batch.salesStartAt || batch.salesStartAt <= now) &&
        (!batch.salesEndAt || batch.salesEndAt >= now),
    )
    .map((batch) => ({
      id: batch.id,
      name: batch.name,
      ticketTypeName: typeNames.get(batch.ticketTypeId) ?? "Ingresso",
      priceCents: batch.priceCents,
      available:
        batch.status === "OPEN" &&
        batch.quantitySold + batch.quantityReserved < batch.quantityTotal,
      maxPerOrder: batch.maxPerOrder,
    }));

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    venueName: event.venueName,
    addressLine: event.addressLine,
    city: event.city,
    state: event.state,
    timezone: event.timezone,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    ageRating: event.ageRating,
    cancellationPolicy: event.cancellationPolicy,
    eventTerms: event.eventTerms,
    maxTicketsPerOrder: event.maxTicketsPerOrder,
    platformFeeBps: event.platformFeeBps,
    feeMode: event.feeMode,
    batches: visibleBatches,
    // Blocos re-validados por Zod na leitura (JSON corrompido → defaults);
    // eventos sem personalização renderizam a página padrão de sempre.
    page: {
      brandColor: pageRow?.brandColor ?? null,
      logoUrl: pageRow?.logoUrl ?? null,
      bannerUrl: pageRow?.bannerUrl ?? null,
      faviconUrl: pageRow?.faviconUrl ?? null,
      blocks: pageRow ? parseStoredBlocks(pageRow.blocks) : defaultPageBlocks(),
    },
    organizer: organizerIdentity
      ? { publicName: organizerIdentity.publicName, logoUrl: organizerIdentity.logoUrl }
      : null,
  };
}

export function formatBRL(centsValue: number): string {
  return (centsValue / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatEventDate(date: Date | null, timezone: string): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}
