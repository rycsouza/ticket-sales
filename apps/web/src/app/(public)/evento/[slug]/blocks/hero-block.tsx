import { CalendarDays, MapPin, ShieldAlert } from "lucide-react";
import { formatEventDate, type PublicEventView } from "@/lib/public-views";

type HeroConfig = {
  showLogo: boolean;
  showTitle: boolean;
  showDate: boolean;
  overlay: "none" | "dark" | "brand";
};

const OVERLAY_CLASS: Record<HeroConfig["overlay"], string> = {
  none: "",
  dark: "bg-gradient-to-t from-black/70 via-black/30 to-transparent",
  brand: "bg-gradient-to-t from-brand/80 via-brand/30 to-transparent",
};

/**
 * Cabeçalho da página. Sem banner, reproduz exatamente o header textual
 * original; com banner, a imagem vira capa com título/logo sobrepostos.
 */
export function HeroBlock({ event, config }: { event: PublicEventView; config: HeroConfig }) {
  const dateLabel = formatEventDate(event.startsAt, event.timezone);
  const { bannerUrl, logoUrl } = event.page;
  const showLogo = config.showLogo && Boolean(logoUrl);

  const meta = (
    <div className="mt-3 space-y-1.5 text-body text-ink-soft">
      {config.showDate && dateLabel && (
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
  );

  if (!bannerUrl) {
    return (
      <header className="mb-6">
        {showLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl ?? undefined} alt="" className="mb-3 h-12 w-auto object-contain" />
        )}
        <p className="mb-1 text-caption font-semibold uppercase tracking-widest text-brand">
          Evento
        </p>
        {config.showTitle && <h1 className="text-h1 leading-tight text-ink">{event.title}</h1>}
        {meta}
      </header>
    );
  }

  return (
    <header className="mb-6">
      <div className="relative -mx-4 overflow-hidden sm:mx-0 sm:rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bannerUrl} alt="" className="aspect-[16/9] w-full object-cover" />
        {config.overlay !== "none" && (
          <div className={`absolute inset-0 ${OVERLAY_CLASS[config.overlay]}`} aria-hidden />
        )}
        {(showLogo || config.showTitle) && (
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
            {showLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl ?? undefined}
                alt=""
                className="size-14 shrink-0 rounded-lg bg-surface object-contain p-1 shadow-md"
              />
            )}
            {config.showTitle && (
              <h1
                className={`text-h1 leading-tight ${
                  config.overlay === "none" ? "text-ink" : "text-white drop-shadow"
                }`}
              >
                {event.title}
              </h1>
            )}
          </div>
        )}
      </div>
      {!config.showTitle && <h1 className="sr-only">{event.title}</h1>}
      {meta}
    </header>
  );
}
