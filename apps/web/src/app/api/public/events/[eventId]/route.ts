import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/http";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";
import { getServices } from "@/lib/services";

const paramsSchema = z.string().uuid();

/**
 * Public event page data (FR-CHK-001..003). No auth: only PUBLISHED events
 * resolve, and the response is a curated allowlist — internal counters,
 * organization data and terminal states never leak.
 */
export const GET = route<{ eventId: string }>(async (request, { params }) => {
  await enforceRateLimit("public-event", clientIpFrom(request), 120, 60);

  const eventId = paramsSchema.parse(params.eventId);
  const services = getServices();

  const event = await services.publicEvents.findPublishedById(eventId);
  if (!event) {
    return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  }

  const now = new Date();
  const [batches, ticketTypes] = await Promise.all([
    services.batchesRepo.listByEvent(event.organizationId, event.id),
    services.ticketTypesRepo.listByEvent(event.organizationId, event.id),
  ]);
  const typeNames = new Map(ticketTypes.map((t) => [t.id, t.name]));

  const visibleBatches = batches
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
      // Availability as a boolean — exact counters are internal (FR-CHK-003)
      available:
        batch.status === "OPEN" &&
        batch.quantitySold + batch.quantityReserved < batch.quantityTotal,
      maxPerOrder: batch.maxPerOrder,
    }));

  return NextResponse.json({
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
  });
});
