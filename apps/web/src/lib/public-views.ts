import "server-only";

import { getServices } from "./services";

export interface PublicBatchView {
  id: string;
  name: string;
  ticketTypeName: string;
  priceCents: number;
  available: boolean;
  maxPerOrder: number | null;
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
  batches: PublicBatchView[];
}

/**
 * Curated public view of a PUBLISHED event (FR-CHK-001..003). Shared by the
 * JSON API and the SSR page so both expose exactly the same allowlist —
 * internal counters and organization data never leave the server.
 */
export async function getPublicEventView(eventId: string): Promise<PublicEventView | null> {
  const services = getServices();

  const event = await services.publicEvents.findPublishedById(eventId);
  if (!event) return null;

  const now = new Date();
  const [batches, ticketTypes] = await Promise.all([
    services.batchesRepo.listByEvent(event.organizationId, event.id),
    services.ticketTypesRepo.listByEvent(event.organizationId, event.id),
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
    batches: visibleBatches,
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
