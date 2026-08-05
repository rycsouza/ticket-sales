"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";

export type ShowcaseKind = "Bate e volta" | "Pernoite";

export type ShowcaseCardData = {
  id: string;
  slug: string;
  /** URL pública já no vocabulário do nicho (/evento/x ou /viagem/x). */
  href: string;
  /** Só faz sentido no nicho VIAGENS (bate e volta × pernoite). */
  kind: ShowcaseKind | null;
  dateLabel: string;
  venueName: string | null;
  city: string | null;
  state: string | null;
  fromPriceLabel: string | null;
  image: string | null;
  soldOut: boolean;
};

const KIND_FILTERS = ["Todas", "Bate e volta", "Pernoite"] as const;
type KindFilter = (typeof KIND_FILTERS)[number];

function ShowcaseCard({ item, ctaLabel }: { item: ShowcaseCardData; ctaLabel: string }) {
  const location =
    item.city && item.venueName !== item.city
      ? `${item.city}${item.state ? `/${item.state}` : ""}`
      : null;

  return (
    <Link
      href={item.href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-[var(--sf-accent-border)]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-page">
        {item.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt=""
            className={cn(
              "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
              item.soldOut && "opacity-60 saturate-50",
            )}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        {item.kind && (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-black/50 px-2.5 py-1 text-caption font-semibold uppercase tracking-wide text-[var(--sf-accent-text)] backdrop-blur-sm">
            {item.kind}
          </span>
        )}
        {item.soldOut && (
          <span className="absolute right-3 top-3 inline-flex items-center rounded-full bg-black/60 px-2.5 py-1 text-caption font-semibold uppercase tracking-wide text-white/90 backdrop-blur-sm">
            Esgotado
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="font-[family-name:var(--font-storefront-display)] text-xl font-semibold text-white">
            {item.venueName}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-small text-white/80">
            {location && (
              <>
                <MapPin className="size-3.5 shrink-0" /> {location} ·{" "}
              </>
            )}
            {item.dateLabel}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        {item.soldOut ? (
          <p className="text-body font-semibold text-ink-muted">Vagas esgotadas</p>
        ) : item.fromPriceLabel ? (
          <p className="text-body text-ink-soft">
            A partir de{" "}
            <span className="text-h4 font-bold text-[var(--sf-accent-text)]">{item.fromPriceLabel}</span>
          </p>
        ) : (
          <span />
        )}
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-small font-semibold transition-transform group-hover:translate-x-0.5",
            item.soldOut ? "text-ink-muted" : "text-[var(--sf-accent-text)]",
          )}
        >
          {item.soldOut ? "Ver detalhes" : ctaLabel} <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}

export function ShowcaseGrid({
  items,
  showKindFilters,
  emptyLabel,
}: {
  items: ShowcaseCardData[];
  /** Filtros bate e volta × pernoite — utilidade do nicho VIAGENS. */
  showKindFilters: boolean;
  emptyLabel: string;
}) {
  const [filter, setFilter] = useState<KindFilter>("Todas");

  const filtered = useMemo(
    () => (filter === "Todas" ? items : items.filter((t) => t.kind === filter)),
    [filter, items],
  );

  return (
    <div>
      {showKindFilters && (
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {KIND_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-small font-medium transition-colors",
                filter === f
                  ? "border-[var(--sf-accent)] bg-[var(--sf-accent-soft)] text-[var(--sf-accent-text)]"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink-soft",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="text-body text-ink-muted">{emptyLabel}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <ShowcaseCard key={item.id} item={item} ctaLabel="Ver e comprar" />
          ))}
        </div>
      )}
    </div>
  );
}
