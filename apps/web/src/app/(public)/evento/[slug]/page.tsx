import { notFound } from "next/navigation";
import { z } from "zod";
import { CalendarDays, MapPin, ShieldAlert } from "lucide-react";
import { formatEventDate, getPublicEventViewBySlug } from "@/lib/public-views";
import { CheckoutForm } from "./checkout-form";

// Public event slug: lowercase letters, digits and hyphens.
const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) notFound();

  const event = await getPublicEventViewBySlug(parsed.data);
  if (!event) notFound();

  const dateLabel = formatEventDate(event.startsAt, event.timezone);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-16 pt-8">
      <header className="mb-6">
        <p className="mb-1 text-caption font-semibold uppercase tracking-widest text-brand">
          Evento
        </p>
        <h1 className="text-h1 leading-tight text-ink">{event.title}</h1>
        <div className="mt-3 space-y-1.5 text-body text-ink-soft">
          {dateLabel && (
            <p className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-ink-muted" />
              {dateLabel}
            </p>
          )}
          {event.venueName && (
            <p className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-ink-muted" />
              {event.venueName}
              {event.city ? ` — ${event.city}${event.state ? `/${event.state}` : ""}` : ""}
            </p>
          )}
          {event.ageRating && (
            <p className="flex items-center gap-2">
              <ShieldAlert className="size-4 shrink-0 text-ink-muted" />
              Classificação: {event.ageRating}
            </p>
          )}
        </div>
      </header>

      {event.description && (
        <section className="mb-6 whitespace-pre-line rounded-xl border border-line bg-surface p-4 text-body leading-relaxed text-ink-soft">
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
