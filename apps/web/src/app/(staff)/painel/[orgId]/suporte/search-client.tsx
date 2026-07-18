"use client";

import { useState } from "react";
import Link from "next/link";
import { brl, orderStatusLabel, ORDER_STATUS_LABELS } from "./labels";

type Row = {
  id: string;
  code: string;
  status: string;
  buyerName: string;
  buyerEmail: string;
  totalCents: number;
  createdAt: string;
};

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

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
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          className={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Código, e-mail, nome ou documento"
        />
        <div className="flex gap-2">
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-bold text-white active:bg-brand-600 disabled:opacity-40"
          >
            {busy ? "..." : "Buscar"}
          </button>
        </div>
      </form>

      {rows !== null && (
        <section className="rounded-xl bg-white p-2 shadow-sm">
          {rows.length === 0 ? (
            <p className="p-4 text-center text-sm text-ink-400">Nenhum pedido encontrado.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/painel/${orgId}/suporte/${o.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 active:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {o.buyerName}
                      </span>
                      <span className="block truncate text-xs text-ink-400">
                        {o.code} · {o.buyerEmail}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold text-ink-900">
                        {brl(o.totalCents)}
                      </span>
                      <span className="block text-xs text-ink-400">
                        {orderStatusLabel(o.status)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
