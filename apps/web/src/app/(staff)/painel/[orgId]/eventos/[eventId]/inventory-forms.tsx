"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

function useSubmit(onOk: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(url: string, body: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Falha na operação.");
        return false;
      }
      onOk();
      return true;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, send };
}

export function NewTicketTypeForm({ orgId, eventId }: { orgId: string; eventId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("FULL");
  const { busy, error, send } = useSubmit(() => {
    setName("");
    router.refresh();
  });

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void send(`/api/orgs/${orgId}/events/${eventId}/ticket-types`, { name: name.trim(), kind });
      }}
    >
      <input
        className={`${input} min-w-40 flex-1`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome (ex.: Pista)"
      />
      <select className={`${input} w-32`} value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="FULL">Inteira</option>
        <option value="HALF">Meia</option>
        <option value="PROMOTIONAL">Promocional</option>
        <option value="COURTESY">Cortesia</option>
        <option value="CUSTOM">Personalizada</option>
      </select>
      <button
        type="submit"
        disabled={busy || name.trim().length === 0}
        className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-bold text-white active:bg-brand-600 disabled:opacity-40"
      >
        Adicionar
      </button>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </form>
  );
}

export function NewBatchForm({
  orgId,
  eventId,
  ticketTypes,
}: {
  orgId: string;
  eventId: string;
  ticketTypes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    ticketTypeId: ticketTypes[0]?.id ?? "",
    name: "",
    price: "",
    quantityTotal: "",
    maxPerOrder: "",
  });
  const { busy, error, send } = useSubmit(() => {
    setForm((f) => ({ ...f, name: "", price: "", quantityTotal: "", maxPerOrder: "" }));
    router.refresh();
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-sm font-semibold text-brand-600">+ Novo lote</summary>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body: Record<string, unknown> = {
            ticketTypeId: form.ticketTypeId,
            name: form.name.trim(),
            priceCents: Math.round(Number(form.price) * 100),
            quantityTotal: Number(form.quantityTotal),
          };
          if (form.maxPerOrder) body.maxPerOrder = Number(form.maxPerOrder);
          void send(`/api/orgs/${orgId}/events/${eventId}/batches`, body);
        }}
      >
        <select className={input} value={form.ticketTypeId} onChange={(e) => set("ticketTypeId", e.target.value)}>
          {ticketTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nome do lote (ex.: 1º Lote)" />
        <div className="grid grid-cols-3 gap-2">
          <input className={input} type="number" min={0} step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="Preço R$" />
          <input className={input} type="number" min={1} value={form.quantityTotal} onChange={(e) => set("quantityTotal", e.target.value)} placeholder="Qtd" />
          <input className={input} type="number" min={1} value={form.maxPerOrder} onChange={(e) => set("maxPerOrder", e.target.value)} placeholder="Máx/pedido" />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy || !form.ticketTypeId || form.name.trim().length === 0 || !form.price || !form.quantityTotal}
          className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-bold text-white active:bg-brand-600 disabled:opacity-40"
        >
          {busy ? "Criando..." : "Criar lote"}
        </button>
      </form>
    </details>
  );
}
