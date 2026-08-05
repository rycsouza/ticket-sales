"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import type { OrgVocab } from "@/lib/org-vocab";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Inline editor for the event's core details (everything from creation except
 * location, which has its own card, and the platform fee, which is admin-only). */
export function EventDetailsForm({
  vocab,
  apiBase,
  initial,
}: {
  vocab: OrgVocab;
  apiBase: string;
  initial: {
    title: string;
    startsAt: string | null;
    endsAt: string | null;
    capacityTotal: number | null;
    maxTicketsPerOrder: number | null;
  };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [startsAt, setStartsAt] = useState(toLocalInput(initial.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial.endsAt));
  const [capacity, setCapacity] = useState(initial.capacityTotal ? String(initial.capacityTotal) : "");
  const [maxPerOrder, setMaxPerOrder] = useState(
    initial.maxTicketsPerOrder ? String(initial.maxTicketsPerOrder) : "",
  );
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const capacityNum = capacity === "" ? null : Number(capacity);
  const capacityChanged = capacityNum !== initial.capacityTotal;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      // Details (title/description/dates/per-order cap) via the details endpoint.
      const details: Record<string, unknown> = {};
      if (title.trim()) details.title = title.trim();
      if (startsAt) details.startsAt = new Date(startsAt).toISOString();
      if (endsAt) details.endsAt = new Date(endsAt).toISOString();
      if (maxPerOrder !== "") details.maxTicketsPerOrder = Number(maxPerOrder);

      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "Não foi possível salvar os detalhes.");
        return;
      }

      // Capacity has its own audited endpoint (requires a justification).
      if (capacityChanged && capacityNum !== null) {
        const capRes = await fetch(`${apiBase}/capacity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capacityTotal: capacityNum,
            justification: justification.trim() || "Ajuste de capacidade pelo painel",
          }),
        });
        if (!capRes.ok) {
          const d = (await capRes.json().catch(() => ({}))) as { error?: string };
          setError(d.error ?? "Não foi possível alterar a capacidade.");
          return;
        }
      }

      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Título" htmlFor="ed-title">
        <Input id="ed-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-small text-ink-muted">
        A descrição do evento fica em <strong className="text-ink-soft">Página</strong> → bloco
        Descrição.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Início" htmlFor="ed-start">
          <Input
            id="ed-start"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </Field>
        <Field label="Término (opcional)" htmlFor="ed-end">
          <Input
            id="ed-end"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Capacidade (opcional)"
          htmlFor="ed-cap"
          hint="Vazio = usa a soma dos lotes."
        >
          <Input
            id="ed-cap"
            type="number"
            min={1}
            step={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="Sem limite fixo"
          />
        </Field>
        <Field label={`Máx. de ${vocab.tickets} por pedido`} htmlFor="ed-max" hint="Opcional.">
          <Input
            id="ed-max"
            type="number"
            min={1}
            step={1}
            value={maxPerOrder}
            onChange={(e) => setMaxPerOrder(e.target.value)}
            placeholder="Sem limite"
          />
        </Field>
      </div>
      {capacityChanged && capacityNum !== null && (
        <Field
          label="Justificativa da capacidade"
          htmlFor="ed-just"
          hint="Registrada na auditoria da mudança de capacidade."
        >
          <Input
            id="ed-just"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Ex.: liberação de mais lugares"
          />
        </Field>
      )}
      {error && <p className="text-small text-danger-text">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={save} loading={busy} disabled={title.trim().length < 3}>
          Salvar detalhes
        </Button>
        {saved && <span className="text-small text-success">Salvo</span>}
      </div>
    </div>
  );
}
