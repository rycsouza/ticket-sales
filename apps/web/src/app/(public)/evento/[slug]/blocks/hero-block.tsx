import { CalendarDays, MapPin, ShieldAlert } from "lucide-react";
import { formatEventDate } from "@/lib/public-view-format";
import type { PublicEventView } from "@/lib/public-views";
import { StepOneOnly } from "../checkout-flow";
import { HeroCarousel } from "./hero-carousel";

type HeroConfig = {
  showLogo: boolean;
  showTitle: boolean;
  showDate: boolean;
  overlay: "none" | "dark" | "brand";
  images: string[];
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
  const endLabel = formatEventDate(event.endsAt, event.timezone);
  const { bannerUrl, logoUrl } = event.page;
  const showLogo = config.showLogo && Boolean(logoUrl);
  // Cover source: the new multi-image config, falling back to the legacy single
  // banner so events saved before the carousel keep rendering their cover.
  const covers = config.images.length > 0 ? config.images : bannerUrl ? [bannerUrl] : [];
  const overlayClass = config.overlay !== "none" ? OVERLAY_CLASS[config.overlay] : "";

  // The event meta (dates, venue, age rating) only matters while the buyer is
  // choosing tickets. From step 2 on it collapses — same as the countdown and
  // location blocks — so the form / Pix isn't pushed below a tall header.
  const meta = (
    <StepOneOnly>
    <div className="mt-3 space-y-1.5 text-body text-ink-soft">
      {config.showDate && dateLabel && (
        <p className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-ink-muted" />
          {endLabel ? `Início: ${dateLabel}` : dateLabel}
        </p>
      )}
      {config.showDate && endLabel && (
        <p className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-ink-muted" />
          Término: {endLabel}
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
    </StepOneOnly>
  );

  if (covers.length === 0) {
    return (
      <header>
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

  const isCarousel = covers.length > 1;
  const titleOverlay = (showLogo || config.showTitle) && (
    // Display-only; pointer-events-none keeps the carousel arrows/dots clickable.
    // Extra bottom padding on the carousel lifts the title clear of the dots row.
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 ${
        isCarousel ? "pb-8" : ""
      }`}
    >
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
  );

  return (
    <header>
      <div className="relative overflow-hidden rounded-xl">
        {isCarousel ? (
          <HeroCarousel images={covers} overlayClass={overlayClass} />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={covers[0]} alt="" className="aspect-[16/9] w-full object-cover" />
            {overlayClass && <div className={`absolute inset-0 ${overlayClass}`} aria-hidden />}
          </>
        )}
        {titleOverlay}
      </div>
      {!config.showTitle && <h1 className="sr-only">{event.title}</h1>}
      {meta}
    </header>
  );
}
