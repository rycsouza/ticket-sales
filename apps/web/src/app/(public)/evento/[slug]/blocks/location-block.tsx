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

  // Rua + número numa linha só (ex.: "Rua X, 123").
  const streetLine = event.addressLine
    ? `${event.addressLine}${event.addressNumber ? `, ${event.addressNumber}` : ""}`
    : null;

  // Prefer the textual query (venue + address): the Google embed geocodes it and
  // drops a *labelled*, recognizable pin ("Pérola Negra"). Saved coordinates are
  // only a fallback for events with no usable address text — a bare lat/lng pin
  // has no label and a CEP centroid can be less precise. Data is the event's own.
  const hasCoords = event.latitude !== null && event.longitude !== null;
  const textQuery = [event.venueName, streetLine, event.neighborhood, event.city, event.state]
    .filter(Boolean)
    .join(", ");
  const mapQuery = textQuery || (hasCoords ? `${event.latitude},${event.longitude}` : "");

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
        {streetLine && <p className="mt-1">{streetLine}</p>}
        {event.neighborhood && <p className="mt-0.5">{event.neighborhood}</p>}
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
