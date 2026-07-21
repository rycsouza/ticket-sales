"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MessageCircle,
  MoreVertical,
  Receipt,
  Repeat,
  Search,
  Ticket,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Badge, Button, Input, Menu, MenuItem, Select, Stat } from "@/components/ui";
import { ConfirmDialog } from "../../ui";
import { fmtBRL, fmtDate, fmtDateTime } from "@/lib/status";
import { pluralize, whatsappUrl } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface BuyerRow {
  email: string;
  name: string | null;
  phone: string | null;
  optedOut: boolean;
  orderCount: number;
  totalSpentCents: number;
  lastPurchaseAt: string | null; // ISO
}

type Period = "all" | "today" | "7d" | "30d";
type Comm = "all" | "active" | "disabled";
type Sort = "recent" | "spent" | "orders" | "name";

const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "Todo o período" },
  { key: "today", label: "Hoje" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "30d", label: "Últimos 30 dias" },
];

function initials(name: string | null, email: string): string {
  const base = (name ?? email).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Communication status from the opt-out flag (only two states are known from
 * the segment; consent history isn't part of the list data). */
function CommStatus({ optedOut }: { optedOut: boolean }) {
  return optedOut ? (
    <Badge tone="neutral">
      <span aria-hidden className="size-1.5 rounded-full bg-ink-faint" />
      Comunicações desativadas
    </Badge>
  ) : (
    <Badge tone="success">
      <span aria-hidden className="size-1.5 rounded-full bg-success" />
      Comunicações ativas
    </Badge>
  );
}

function Avatar({ name, email }: { name: string | null; email: string }) {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-caption font-semibold text-brand"
    >
      {initials(name, email)}
    </span>
  );
}

const PAGE_SIZE = 20;

export function BuyersClient({
  orgId,
  rows,
  eventScoped,
}: {
  orgId: string;
  rows: BuyerRow[];
  eventScoped: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [comm, setComm] = useState<Comm>("all");
  const [recurrent, setRecurrent] = useState(false);
  const [period, setPeriod] = useState<Period>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [page, setPage] = useState(0);
  const [commTarget, setCommTarget] = useState<BuyerRow | null>(null);

  const now = Date.now();
  function withinPeriod(iso: string | null): boolean {
    if (period === "all") return true;
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (period === "today") {
      const d = new Date(iso);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    }
    const days = period === "7d" ? 7 : 30;
    return now - t <= days * 24 * 3600 * 1000;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (q && !(r.name ?? "").toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) {
        return false;
      }
      if (comm === "active" && r.optedOut) return false;
      if (comm === "disabled" && !r.optedOut) return false;
      if (recurrent && r.orderCount <= 1) return false;
      if (!withinPeriod(r.lastPurchaseAt)) return false;
      return true;
    });
    const time = (r: BuyerRow) => (r.lastPurchaseAt ? new Date(r.lastPurchaseAt).getTime() : 0);
    return [...list].sort((a, b) => {
      switch (sort) {
        case "spent":
          return b.totalSpentCents - a.totalSpentCents;
        case "orders":
          return b.orderCount - a.orderCount;
        case "name":
          return (a.name ?? a.email).localeCompare(b.name ?? b.email, "pt-BR");
        default:
          return time(b) - time(a);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, comm, recurrent, period, sort]);

  // KPIs reflect the current filtered set.
  const kpis = useMemo(() => {
    const orders = filtered.reduce((s, r) => s + r.orderCount, 0);
    const total = filtered.reduce((s, r) => s + r.totalSpentCents, 0);
    return { buyers: filtered.length, orders, total, avg: orders > 0 ? Math.round(total / orders) : 0 };
  }, [filtered]);

  const activeFilters =
    (query.trim() ? 1 : 0) + (comm !== "all" ? 1 : 0) + (recurrent ? 1 : 0) + (period !== "all" ? 1 : 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const paged = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  function resetFilters() {
    setQuery("");
    setComm("all");
    setRecurrent(false);
    setPeriod("all");
    setPage(0);
  }

  async function applyComm(target: BuyerRow, optedOut: boolean) {
    const res = await fetch(`/api/orgs/${orgId}/customers/opt-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: target.email, optedOut }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "Não foi possível atualizar." };
    router.refresh();
    return { ok: true };
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Compradores" value={kpis.buyers.toLocaleString("pt-BR")} icon={<Users className="size-4" />} />
        <Stat label="Pedidos pagos" value={kpis.orders.toLocaleString("pt-BR")} icon={<Receipt className="size-4" />} />
        <Stat label="Valor total comprado" value={fmtBRL(kpis.total)} icon={<TrendingUp className="size-4" />} />
        <Stat
          label="Ticket médio"
          value={kpis.orders > 0 ? fmtBRL(kpis.avg) : "—"}
          hint="Valor total ÷ pedidos pagos"
          icon={<Ticket className="size-4" />}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar por nome ou e-mail"
            className="pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:bg-hover"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Status de comunicação"
            value={comm}
            onChange={(e) => {
              setComm(e.target.value as Comm);
              setPage(0);
            }}
            className="w-auto"
          >
            <option value="all">Toda comunicação</option>
            <option value="active">Comunicações ativas</option>
            <option value="disabled">Comunicações desativadas</option>
          </Select>
          <Select
            aria-label="Período da última compra"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as Period);
              setPage(0);
            }}
            className="w-auto"
          >
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Ordenar"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="w-auto"
          >
            <option value="recent">Compra mais recente</option>
            <option value="spent">Maior valor comprado</option>
            <option value="orders">Mais pedidos</option>
            <option value="name">Nome (A–Z)</option>
          </Select>
          <button
            type="button"
            aria-pressed={recurrent}
            onClick={() => {
              setRecurrent((v) => !v);
              setPage(0);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 text-small font-medium transition-colors",
              recurrent
                ? "border-brand-border bg-brand-soft text-brand"
                : "border-line-strong bg-surface text-ink-soft hover:bg-hover",
            )}
          >
            <Repeat className="size-4" />
            Recorrentes
          </button>
        </div>
      </div>

      {/* Result count + clear */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-small text-ink-muted" role="status" aria-live="polite">
          {pluralize(filtered.length, "comprador encontrado", "compradores encontrados")}
          {eventScoped ? " neste evento" : ""}
        </p>
        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Limpar filtros
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-h3 text-ink">Nenhum comprador encontrado</p>
          <p className="mt-1 text-body text-ink-muted">Revise os termos pesquisados ou remova alguns filtros.</p>
          {activeFilters > 0 && (
            <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-line bg-surface md:block">
            <table className="w-full text-body">
              <caption className="sr-only">Lista de compradores</caption>
              <thead>
                <tr className="border-b border-line text-left text-small text-ink-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">Comprador</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Pedidos</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Total comprado</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Última compra</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Comunicação</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paged.map((r) => (
                  <tr key={r.email} className="hover:bg-hover">
                    <td className="px-4 py-3">
                      <Link
                        href={`/painel/${orgId}/compradores/${encodeURIComponent(r.email)}`}
                        className="flex items-center gap-3 rounded-md focus-visible:outline-2"
                      >
                        <Avatar name={r.name} email={r.email} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink" title={r.name ?? undefined}>
                            {r.name ?? "—"}
                          </span>
                          <span className="block truncate text-small text-ink-muted" title={r.email}>
                            {r.email}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-soft">{r.orderCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{fmtBRL(r.totalSpentCents)}</td>
                    <td className="px-4 py-3 text-ink-soft" title={r.lastPurchaseAt ? fmtDateTime(r.lastPurchaseAt) : undefined}>
                      {r.lastPurchaseAt ? fmtDate(r.lastPurchaseAt) : "—"}
                    </td>
                    <td className="px-4 py-3"><CommStatus optedOut={r.optedOut} /></td>
                    <td className="px-4 py-3 text-right">
                      <RowActions orgId={orgId} buyer={r} onComm={setCommTarget} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {paged.map((r) => (
              <li key={r.email} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/painel/${orgId}/compradores/${encodeURIComponent(r.email)}`}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <Avatar name={r.name} email={r.email} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{r.name ?? "—"}</span>
                      <span className="block truncate text-small text-ink-muted">{r.email}</span>
                    </span>
                  </Link>
                  <RowActions orgId={orgId} buyer={r} onComm={setCommTarget} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-1 text-small">
                  <dt className="text-ink-muted">Pedidos</dt>
                  <dd className="text-right tabular-nums text-ink-soft">{r.orderCount}</dd>
                  <dt className="text-ink-muted">Total comprado</dt>
                  <dd className="text-right tabular-nums text-ink">{fmtBRL(r.totalSpentCents)}</dd>
                  <dt className="text-ink-muted">Última compra</dt>
                  <dd className="text-right text-ink-soft">{r.lastPurchaseAt ? fmtDate(r.lastPurchaseAt) : "—"}</dd>
                </dl>
                <div className="mt-2"><CommStatus optedOut={r.optedOut} /></div>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-small text-ink-muted">
                Página {current + 1} de {pageCount}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={current >= pageCount - 1}
                  onClick={() => setPage(current + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={commTarget !== null}
        onClose={() => setCommTarget(null)}
        title={
          commTarget?.optedOut ? "Reativar comunicações promocionais?" : "Desativar comunicações promocionais?"
        }
        description={
          commTarget?.optedOut
            ? "O comprador voltará a poder receber campanhas e mensagens promocionais."
            : "O comprador deixará de receber campanhas e mensagens promocionais."
        }
        confirmLabel={commTarget?.optedOut ? "Reativar comunicações" : "Desativar comunicações"}
        tone={commTarget?.optedOut ? "primary" : "danger"}
        onConfirm={() => applyComm(commTarget!, !commTarget!.optedOut)}
      />
    </div>
  );
}

function RowActions({
  orgId,
  buyer,
  onComm,
}: {
  orgId: string;
  buyer: BuyerRow;
  onComm: (b: BuyerRow) => void;
}) {
  const wa = whatsappUrl(buyer.phone);
  return (
    <Menu
      triggerContent={<MoreVertical className="size-4" />}
      triggerAriaLabel={`Ações de ${buyer.name ?? buyer.email}`}
      triggerVariant="ghost"
      triggerClassName="px-1.5"
    >
      <MenuItem href={`/painel/${orgId}/compradores/${encodeURIComponent(buyer.email)}`}>
        Ver comprador
      </MenuItem>
      {wa && !buyer.optedOut && (
        <MenuItem icon={<MessageCircle className="size-4" />} href={wa} external>
          Conversar no WhatsApp
        </MenuItem>
      )}
      <MenuItem destructive={!buyer.optedOut} onSelect={() => onComm(buyer)}>
        {buyer.optedOut ? "Reativar comunicações" : "Desativar comunicações promocionais"}
      </MenuItem>
    </Menu>
  );
}
