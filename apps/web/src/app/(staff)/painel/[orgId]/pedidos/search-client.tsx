"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from "@/components/ui";
import type { OrgVocab } from "@/lib/org-vocab";
import { ORDER_STATUS, fmtBRL, statusMeta } from "@/lib/status";

type Row = {
  id: string;
  code: string;
  status: string;
  buyerName: string;
  buyerEmail: string;
  totalCents: number;
  createdAt: string;
};

type EventOption = { id: string; title: string };

const PAGE_SIZE = 20;

export function OrdersSearch({
  orgId,
  orgSlug,
  vocab,
  events,
}: {
  orgId: string;
  orgSlug: string;
  vocab: OrgVocab;
  events: EventOption[];
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [eventId, setEventId] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);

  const search = useCallback(async () => {
    setBusy(true);
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (status) sp.set("status", status);
      if (eventId) sp.set("eventId", eventId);
      sp.set("limit", "50");
      const res = await fetch(`/api/orgs/${orgId}/orders?${sp.toString()}`);
      const data = (await res.json().catch(() => ({}))) as { orders?: Row[] };
      setRows(res.ok ? (data.orders ?? []) : []);
      setPage(0);
    } finally {
      setBusy(false);
    }
  }, [orgId, q, status, eventId]);

  // Show the most recent orders on arrival — this is a listing, not a blank
  // search box. Filters below refine it.
  useEffect(() => {
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageCount = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1;
  const current = Math.min(page, pageCount - 1);
  const paged = rows ? rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE) : [];

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Código, e-mail, nome ou documento"
          className="sm:min-w-[16rem] sm:flex-1"
        />
        {events.length > 0 && (
          <Select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            aria-label={vocab.filterByEvent}
            className="w-full sm:w-56"
          >
            <option value="">{vocab.allEvents}</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </Select>
        )}
        <div className="flex gap-2">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filtrar por status"
            className="w-full sm:w-52"
          >
            <option value="">Todos os status</option>
            {Object.entries(ORDER_STATUS).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
          <Button type="submit" loading={busy} leftIcon={<Search className="size-[18px]" />}>
            Buscar
          </Button>
        </div>
      </form>

      {rows === null ? (
        <Card className="flex items-center justify-center py-16">
          <Spinner />
        </Card>
      ) : (
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              icon={<Search className="size-5" />}
              title="Nenhum pedido encontrado"
              description={`Ajuste os termos da busca ou os filtros de ${vocab.event} e status.`}
            />
          ) : (
            <ul className="divide-y divide-line">
              {paged.map((o) => {
                const s = statusMeta(ORDER_STATUS, o.status);
                return (
                  <li key={o.id}>
                    <Link
                      href={`/painel/${orgSlug}/pedidos/${o.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-hover"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-body font-medium text-ink">
                          {o.buyerName}
                        </span>
                        <span className="block truncate text-small text-ink-muted">
                          <span className="font-mono">{o.code}</span> · {o.buyerEmail}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-right">
                          <span className="block text-body font-semibold tabular-nums text-ink">
                            {fmtBRL(o.totalCents)}
                          </span>
                        </span>
                        <Badge tone={s.tone}>{s.label}</Badge>
                        <ChevronRight className="size-4 text-ink-faint" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {rows.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
              <span className="text-small text-ink-muted">
                Página {current + 1} de {pageCount}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                >
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
        </Card>
      )}
    </div>
  );
}
