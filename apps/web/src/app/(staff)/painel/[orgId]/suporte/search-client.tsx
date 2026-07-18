"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Select } from "@/components/ui";
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

export function SupportSearch({ orgId }: { orgId: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (status) sp.set("status", status);
      const res = await fetch(`/api/orgs/${orgId}/orders?${sp.toString()}`);
      const data = (await res.json().catch(() => ({}))) as { orders?: Row[] };
      setRows(res.ok ? (data.orders ?? []) : []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Código, e-mail, nome ou documento"
          className="sm:flex-1"
        />
        <div className="flex gap-2">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
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

      {rows !== null && (
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              icon={<Search className="size-5" />}
              title="Nenhum pedido encontrado"
              description="Ajuste os termos da busca ou o filtro de status."
            />
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((o) => {
                const s = statusMeta(ORDER_STATUS, o.status);
                return (
                  <li key={o.id}>
                    <Link
                      href={`/painel/${orgId}/suporte/${o.id}`}
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
        </Card>
      )}
    </div>
  );
}
