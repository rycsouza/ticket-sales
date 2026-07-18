"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function NewEventForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    venueName: "",
    city: "",
    state: "",
    startsAt: "",
    capacityTotal: "",
    feePercent: "10",
    feeMode: "PRODUCER",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        slug: slugify(form.title),
        feeMode: form.feeMode,
        platformFeeBps: Math.round(Number(form.feePercent) * 100),
      };
      if (form.venueName.trim()) body.venueName = form.venueName.trim();
      if (form.city.trim()) body.city = form.city.trim();
      if (form.state.trim()) body.state = form.state.trim().toUpperCase();
      if (form.startsAt) body.startsAt = new Date(form.startsAt).toISOString();
      if (form.capacityTotal) body.capacityTotal = Number(form.capacityTotal);

      const res = await fetch(`/api/orgs/${orgId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Não foi possível criar o evento.");
        return;
      }
      router.push(`/painel/${orgId}/eventos/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

  return (
    <details className="rounded-xl bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-sm font-semibold text-brand-600">
        + Novo evento
      </summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Título</span>
          <input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Festa de Verão" />
          {form.title && <span className="mt-1 block text-xs text-ink-400">/{slugify(form.title)}</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Local</span>
          <input className={input} value={form.venueName} onChange={(e) => set("venueName", e.target.value)} placeholder="Clube da Cidade" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 block">
            <span className="mb-1 block text-sm font-medium">Cidade</span>
            <input className={input} value={form.city} onChange={(e) => set("city", e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">UF</span>
            <input className={input} maxLength={2} value={form.state} onChange={(e) => set("state", e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Início</span>
            <input type="datetime-local" className={input} value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Capacidade</span>
            <input type="number" min={1} className={input} value={form.capacityTotal} onChange={(e) => set("capacityTotal", e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Taxa (%)</span>
            <input type="number" min={0} max={100} step="0.1" className={input} value={form.feePercent} onChange={(e) => set("feePercent", e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Quem paga a taxa</span>
            <select className={input} value={form.feeMode} onChange={(e) => set("feeMode", e.target.value)}>
              <option value="PRODUCER">Produtora (deduz do repasse)</option>
              <option value="BUYER">Comprador (soma ao total)</option>
            </select>
          </label>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy || form.title.trim().length < 3}
          className="w-full rounded-xl bg-brand-500 py-3 text-base font-bold text-white active:bg-brand-600 disabled:opacity-50"
        >
          {busy ? "Criando..." : "Criar evento"}
        </button>
      </form>
    </details>
  );
}
