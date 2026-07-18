import { notFound } from "next/navigation";
import { z } from "zod";
import { formatEventDate, getPublicEventView } from "@/lib/public-views";
import { CheckoutForm } from "./checkout-form";

const paramsSchema = z.string().uuid();

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const parsed = paramsSchema.safeParse(eventId);
  if (!parsed.success) notFound();

  const event = await getPublicEventView(parsed.data);
  if (!event) notFound();

  const dateLabel = formatEventDate(event.startsAt, event.timezone);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-16 pt-8">
      <header className="mb-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand-600">
          Evento
        </p>
        <h1 className="text-2xl font-bold leading-tight">{event.title}</h1>
        <div className="mt-3 space-y-1 text-sm text-ink-600">
          {dateLabel && <p>📅 {dateLabel}</p>}
          {event.venueName && (
            <p>
              📍 {event.venueName}
              {event.city ? ` — ${event.city}${event.state ? `/${event.state}` : ""}` : ""}
            </p>
          )}
          {event.ageRating && <p>🔞 Classificação: {event.ageRating}</p>}
        </div>
      </header>

      {event.description && (
        <section className="mb-6 whitespace-pre-line rounded-xl bg-white p-4 text-sm leading-relaxed text-ink-600 shadow-sm">
          {event.description}
        </section>
      )}

      <CheckoutForm
        eventId={event.id}
        batches={event.batches}
        maxTicketsPerOrder={event.maxTicketsPerOrder}
        platformFeeBps={event.platformFeeBps}
        feeMode={event.feeMode}
        eventTerms={event.eventTerms}
        cancellationPolicy={event.cancellationPolicy}
      />
    </main>
  );
}
