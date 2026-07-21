"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, MoreVertical, Search } from "lucide-react";
import {
  Badge,
  Card,
  EmptyState,
  Input,
  Menu,
  MenuItem,
  Select,
} from "@/components/ui";
import { EVENT_STATUS, fmtDateTime, statusMeta } from "@/lib/status";
import { cn } from "@/lib/cn";

export interface EventListItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  startsAt: string | null;
  location: string | null;
  soldQty: number;
  capacity: number | null;
  availableOpen: number;
}

type Group = "all" | "upcoming" | "draft" | "closed";

const GROUPS: { key: Group; label: string; match: (s: string) => boolean }[] = [
  { key: "all", label: "Todos", match: () => true },
  { key: "upcoming", label: "Publicados", match: (s) => s === "PUBLISHED" || s === "SALES_PAUSED" },
  { key: "draft", label: "Rascunhos", match: (s) => s === "DRAFT" },
  {
    key: "closed",
    label: "Encerrados",
    match: (s) => ["SALES_CLOSED", "COMPLETED", "CANCELLED", "ARCHIVED", "POSTPONED"].includes(s),
  },
];

export function EventsList({ orgId, events }: { orgId: string; events: EventListItem[] }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<Group>("all");
  const [sort, setSort] = useState<"date-desc" | "date-asc">("date-desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groupMatch = GROUPS.find((g) => g.key === group)!.match;
    const list = events.filter((e) => groupMatch(e.status) && (!q || e.title.toLowerCase().includes(q)));
    const time = (e: EventListItem) => (e.startsAt ? new Date(e.startsAt).getTime() : 0);
    return [...list].sort((a, b) =>
      sort === "date-asc" ? time(a) - time(b) : time(b) - time(a),
    );
  }, [events, query, group, sort]);

  return (
    <div className="space-y-4">
      {/* Controls — only shown once there are enough events to warrant them. */}
      {events.length > 3 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome"
              aria-label="Buscar eventos por nome"
              className="pl-9"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              aria-label="Ordenar eventos"
            >
              <option value="date-desc">Data (mais recente)</option>
              <option value="date-asc">Data (mais antiga)</option>
            </Select>
          </div>
        </div>
      )}

      {events.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar por situação">
          {GROUPS.map((g) => {
            const count = events.filter((e) => g.match(e.status)).length;
            const active = group === g.key;
            return (
              <button
                key={g.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setGroup(g.key)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-small font-medium transition-colors",
                  active ? "bg-brand text-brand-fg" : "bg-hover text-ink-soft hover:bg-selected",
                )}
              >
                {g.label}
                <span className={cn("ml-1.5 tabular-nums", active ? "text-brand-fg/80" : "text-ink-muted")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="size-5" />}
            title="Nenhum evento encontrado"
            description="Ajuste a busca ou o filtro para ver outros eventos."
          />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtered.map((e) => (
            <li key={e.id}>
              <EventCard orgId={orgId} event={e} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventCard({ orgId, event }: { orgId: string; event: EventListItem }) {
  const meta = statusMeta(EVENT_STATUS, event.status);
  const base = `/painel/${orgId}/eventos/${event.id}`;
  const pct =
    event.capacity && event.capacity > 0
      ? Math.min(100, Math.round((event.soldQty / event.capacity) * 100))
      : null;
  const hasPublicPage = ["PUBLISHED", "SALES_PAUSED", "SALES_CLOSED"].includes(event.status);
  const location = event.location;

  return (
    <div className="relative flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-hover">
      {/* Stretched link makes the whole card open the workspace without nesting
          interactive elements inside an anchor. */}
      <Link
        href={base}
        aria-label={`Gerenciar ${event.title}`}
        className="absolute inset-0 rounded-xl focus-visible:outline-2"
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-h3 text-ink">{event.title}</h3>
          <div className="mt-1 flex flex-col gap-0.5 text-small text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0" />
              {event.startsAt ? fmtDateTime(event.startsAt) : "Data a definir"}
            </span>
            {location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{location}</span>
              </span>
            )}
          </div>
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-1.5">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <Menu
            triggerContent={<MoreVertical className="size-4" />}
            triggerAriaLabel={`Ações de ${event.title}`}
            triggerVariant="ghost"
            triggerClassName="px-1.5"
          >
            <MenuItem href={base}>Gerenciar</MenuItem>
            {hasPublicPage && (
              <MenuItem href={`/evento/${event.slug}`} external>
                Visualizar página
              </MenuItem>
            )}
          </Menu>
        </div>
      </div>

      {pct !== null ? (
        <div className="mt-auto">
          <div className="mb-1 flex items-center justify-between text-caption text-ink-muted">
            <span>{event.soldQty.toLocaleString("pt-BR")} vendidos</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-hover"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Vendas de ${event.title}`}
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <p className="mt-auto text-caption text-ink-faint">
          {event.soldQty > 0 ? `${event.soldQty} vendidos` : "Sem vendas ainda"}
        </p>
      )}
    </div>
  );
}
