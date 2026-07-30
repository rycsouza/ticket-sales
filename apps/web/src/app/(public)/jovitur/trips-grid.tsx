"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";

export type TripKind = "Bate e volta" | "Pernoite";

export type TripCardData = {
  id: string;
  slug: string;
  kind: TripKind;
  dateLabel: string;
  venueName: string | null;
  city: string | null;
  state: string | null;
  fromPriceLabel: string | null;
  image: string | null;
  soldOut: boolean;
};

const FILTERS = ["Todas", "Bate e volta", "Pernoite"] as const;
type Filter = (typeof FILTERS)[number];

function TripCard({ trip }: { trip: TripCardData }) {
  const location = trip.city && trip.venueName !== trip.city ? `${trip.city}${trip.state ? `/${trip.state}` : ""}` : null;

  return (
    <Link
      href={`/evento/${trip.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-amber-500/50"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-page">
        {trip.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={trip.image}
            alt=""
            className={cn(
              "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
              trip.soldOut && "opacity-60 saturate-50",
            )}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-black/50 px-2.5 py-1 text-caption font-semibold uppercase tracking-wide text-amber-300 backdrop-blur-sm">
          {trip.kind}
        </span>
        {trip.soldOut && (
          <span className="absolute right-3 top-3 inline-flex items-center rounded-full bg-black/60 px-2.5 py-1 text-caption font-semibold uppercase tracking-wide text-white/90 backdrop-blur-sm">
            Esgotado
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="font-[family-name:var(--font-jovitur-display)] text-xl font-semibold text-white">
            {trip.venueName}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-small text-white/80">
            {location && (
              <>
                <MapPin className="size-3.5 shrink-0" /> {location} ·{" "}
              </>
            )}
            {trip.dateLabel}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        {trip.soldOut ? (
          <p className="text-body font-semibold text-ink-muted">Vagas esgotadas</p>
        ) : trip.fromPriceLabel ? (
          <p className="text-body text-ink-soft">
            A partir de <span className="text-h4 font-bold text-amber-400">{trip.fromPriceLabel}</span>
          </p>
        ) : (
          <span />
        )}
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-small font-semibold transition-transform group-hover:translate-x-0.5",
            trip.soldOut ? "text-ink-muted" : "text-amber-400",
          )}
        >
          {trip.soldOut ? "Ver detalhes" : "Ver e comprar"} <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}

export function TripsGrid({ trips }: { trips: TripCardData[] }) {
  const [filter, setFilter] = useState<Filter>("Todas");

  const filtered = useMemo(
    () => (filter === "Todas" ? trips : trips.filter((t) => t.kind === filter)),
    [filter, trips],
  );

  return (
    <div>
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-small font-medium transition-colors",
              filter === f
                ? "border-amber-500 bg-amber-500/10 text-amber-300"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink-soft",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-body text-ink-muted">Nenhuma viagem disponível nessa categoria no momento.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}
