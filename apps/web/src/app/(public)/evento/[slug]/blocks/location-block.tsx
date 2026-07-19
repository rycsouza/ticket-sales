import { ExternalLink, MapPin } from "lucide-react";
import type { PublicEventView } from "@/lib/public-views";

type LocationConfig = {
  heading?: string | undefined;
  note?: string | undefined;
  showMap: boolean;
};

export function LocationBlock({
  event,
  config,
}: {
  event: PublicEventView;
  config: LocationConfig;
}) {
  const hasAddress = event.venueName || event.addressLine || event.city;
  if (!hasAddress && !config.note) return null;

  const cityLine = event.city
    ? `${event.city}${event.state ? `/${event.state}` : ""}`
    : null;

  // Endereço textual para o mapa/rota — dados do próprio evento, nunca do cliente
  const mapQuery = [event.venueName, event.addressLine, event.city, event.state]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-small font-semibold uppercase tracking-wide text-ink-muted">
        {config.heading ?? "Local"}
      </h2>
      <div className="rounded-xl border border-line bg-surface p-4 text-body text-ink-soft">
        {event.venueName && (
          <p className="flex items-center gap-2 font-medium text-ink">
            <MapPin className="size-4 shrink-0 text-ink-muted" />
            {event.venueName}
          </p>
        )}
        {event.addressLine && <p className="mt-1">{event.addressLine}</p>}
        {cityLine && <p className="mt-0.5">{cityLine}</p>}
        {config.note && (
          <p className="mt-3 whitespace-pre-line text-small text-ink-muted">{config.note}</p>
        )}
        {config.showMap && mapQuery && (
          <>
            <div className="mt-3 overflow-hidden rounded-lg border border-line">
              <iframe
                src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`}
                title="Mapa do local"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-48 w-full"
              />
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-small font-medium text-brand hover:underline"
            >
              Como chegar
              <ExternalLink className="size-3.5" />
            </a>
          </>
        )}
      </div>
    </section>
  );
}
