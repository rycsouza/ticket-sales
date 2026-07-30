import "server-only";

import { defaultPageBlocks, parseStoredBlocks, type EventRecord, type PageBlock } from "@ingressos/core";
import { getTenantServices, resolveOrgByRef } from "./services";

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
  backgroundUrl: string | null;
  theme: "light" | "dark";
  blocks: PageBlock[];
}

/** FR-ORG-009 — identidade pública do produtor (bloco "organizer"). */
export interface PublicOrganizerView {
  publicName: string | null;
  logoUrl: string | null;
}

/** Oferta de upsell / order bump exibida no checkout (allowlist pública). */
export interface PublicOfferView {
  id: string;
  kind: "ORDER_BUMP" | "UPSELL";
  title: string;
  description: string | null;
  priceCents: number;
  originalPriceCents: number | null;
  isTicket: boolean;
}

export interface PublicEventView {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  venueName: string | null;
  addressLine: string | null;
  addressNumber: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
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
  offers: PublicOfferView[];
  /** Whether any coupon currently applies — gates the checkout coupon field. */
  couponsAvailable: boolean;
  page: PublicEventPageView;
  organizer: PublicOrganizerView | null;
}

/**
 * Curated public view of a PUBLISHED event (FR-CHK-001..003). Shared by the
 * JSON API and the SSR page so both expose exactly the same allowlist —
 * internal counters and organization data never leave the server.
 *
 * Multi-tenant (docs/MULTITENANT.md §3): the public identifier resolves the
 * OWNING org on the platform first, then the query runs on THAT tenant's DB.
 * Unknown ref → null → generic 404 (fail-closed, anti-enumeration).
 */
export async function getPublicEventView(eventId: string): Promise<PublicEventView | null> {
  const organizationId = await resolveOrgByRef("EVENT_ID", eventId);
  if (!organizationId) return null;
  const services = await getTenantServices(organizationId);
  const event = await services.publicEvents.findPublishedById(eventId);
  return event ? buildPublicEventView(event, services) : null;
}

/** Resolve a published event by its globally-unique public slug (/evento/<slug>). */
export async function getPublicEventViewBySlug(slug: string): Promise<PublicEventView | null> {
  const organizationId = await resolveOrgByRef("EVENT_SLUG", slug);
  if (!organizationId) return null;
  const services = await getTenantServices(organizationId);
  const event = await services.publicEvents.findPublishedBySlug(slug);
  return event ? buildPublicEventView(event, services) : null;
}

/** All published events for an org's public listing pages (e.g. a bespoke LP), ordered by date. */
export async function getPublicEventViewsByOrganization(
  organizationId: string,
): Promise<PublicEventView[]> {
  // Multi-tenant: a org é conhecida — resolve o banco DELA e lista lá
  // (docs/MULTITENANT.md §3). Org sem tenant provisionado → NotFoundOrForbidden.
  const services = await getTenantServices(organizationId);
  const events = await services.publicEvents.listPublishedByOrganization(organizationId);
  return Promise.all(events.map((event) => buildPublicEventView(event, services)));
}

export async function buildPublicEventView(
  event: EventRecord,
  tenantServices?: Awaited<ReturnType<typeof getTenantServices>>,
): Promise<PublicEventView> {
  const services = tenantServices ?? (await getTenantServices(event.organizationId));
  const now = new Date();
  const [batches, ticketTypes, pageRow, organizerIdentity, offers, couponsAvailable] =
    await Promise.all([
      services.batchesRepo.listByEvent(event.organizationId, event.id),
      services.ticketTypesRepo.listByEvent(event.organizationId, event.id),
      services.publicEventPages.findByEventId(event.id),
      services.publicOrganizations.findIdentityById(event.organizationId),
      services.offers.listForCheckout(event.organizationId, event.id).catch(() => []),
      services.promoters.eventHasCoupons(event.organizationId, event.id).catch(() => false),
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
    slug: event.slug,
    title: event.title,
    description: event.description,
    venueName: event.venueName,
    addressLine: event.addressLine,
    addressNumber: event.addressNumber,
    neighborhood: event.neighborhood,
    city: event.city,
    state: event.state,
    latitude: event.latitude,
    longitude: event.longitude,
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
    offers: offers.map((offer) => ({
      id: offer.id,
      kind: offer.kind,
      title: offer.title,
      description: offer.description,
      priceCents: offer.priceCents,
      originalPriceCents: offer.originalPriceCents,
      isTicket: offer.isTicket,
    })),
    couponsAvailable,
    // Blocos re-validados por Zod na leitura (JSON corrompido → defaults);
    // eventos sem personalização renderizam a página padrão de sempre.
    page: {
      brandColor: pageRow?.brandColor ?? null,
      logoUrl: pageRow?.logoUrl ?? null,
      bannerUrl: pageRow?.bannerUrl ?? null,
      faviconUrl: pageRow?.faviconUrl ?? null,
      backgroundUrl: pageRow?.backgroundUrl ?? null,
      theme: pageRow?.theme === "dark" ? "dark" : "light",
      blocks: pageRow ? parseStoredBlocks(pageRow.blocks) : defaultPageBlocks(),
    },
    organizer: organizerIdentity
      ? { publicName: organizerIdentity.publicName, logoUrl: organizerIdentity.logoUrl }
      : null,
  };
}

// Pure formatters live in a server-only-free module so client components (the
// hero, etc.) can import them without pulling server code into the bundle.
// Re-exported here for the many server-side callers that import from this file.
export { formatBRL, formatEventDate } from "./public-view-format";
