"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, MoneyInput, Select } from "@/components/ui";
import { fmtBRL } from "@/lib/status";

type FeeMode = "BUYER" | "PRODUCER";

function bpsToPercent(bps: number): string {
  return (bps / 100).toString();
}

/** Org-wide default fee — inherited by NEW events. */
export function OrgDefaultFeeForm({
  orgId,
  initialBps,
  initialMode,
}: {
  orgId: string;
  initialBps: number;
  initialMode: FeeMode;
}) {
  const router = useRouter();
  const [percent, setPercent] = useState(bpsToPercent(initialBps));
  const [mode, setMode] = useState<FeeMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/fee`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultPlatformFeeBps: Math.round(Number(percent) * 100),
          defaultFeeMode: mode,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Não foi possível salvar." });
        return;
      }
      setMsg({ ok: true, text: "Taxa padrão atualizada. Vale para novos eventos." });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Taxa padrão (%)" htmlFor="org-fee">
          <Input
            id="org-fee"
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </Field>
        <Field label="Quem paga a taxa" htmlFor="org-feemode">
          <Select id="org-feemode" value={mode} onChange={(e) => setMode(e.target.value as FeeMode)}>
            <option value="PRODUCER">Produtora (deduz do repasse)</option>
            <option value="BUYER">Comprador (soma ao total)</option>
          </Select>
        </Field>
      </div>
      <div aria-live="polite">
        {msg && (
          <p className={msg.ok ? "text-small text-success-text" : "text-small text-danger"}>
            {msg.text}
          </p>
        )}
      </div>
      <Button type="submit" loading={busy}>
        Salvar taxa padrão
      </Button>
    </form>
  );
}

/** Per-event fee override. */
export function EventFeeForm({
  orgId,
  eventId,
  initialBps,
  initialMode,
}: {
  orgId: string;
  eventId: string;
  initialBps: number;
  initialMode: FeeMode;
}) {
  const router = useRouter();
  const [percent, setPercent] = useState(bpsToPercent(initialBps));
  const [mode, setMode] = useState<FeeMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/events/${eventId}/fee`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformFeeBps: Math.round(Number(percent) * 100),
          feeMode: mode,
        }),
      });
      if (res.ok) {
        setOk(true);
        setTimeout(() => setOk(false), 2500);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Taxa (%)" htmlFor={`fee-${eventId}`}>
        <Input
          id={`fee-${eventId}`}
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          className="w-24"
        />
      </Field>
      <Field label="Quem paga" htmlFor={`mode-${eventId}`}>
        <Select
          id={`mode-${eventId}`}
          value={mode}
          onChange={(e) => setMode(e.target.value as FeeMode)}
          className="w-44"
        >
          <option value="PRODUCER">Produtora</option>
          <option value="BUYER">Comprador</option>
        </Select>
      </Field>
      <Button type="submit" variant="outline" size="sm" loading={busy}>
        {ok ? "Salvo" : "Salvar"}
      </Button>
    </form>
  );
}

/** External producer payout registered by a platform admin. */
export function ExternalPayoutForm({
  orgId,
  eventId,
  payableCents,
}: {
  orgId: string;
  eventId: string;
  payableCents: number;
}) {
  const router = useRouter();
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const valid = amountCents !== null && amountCents > 0 && memo.trim().length >= 3;

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/events/${eventId}/payouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, memo: memo.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Não foi possível registrar." });
        return;
      }
      setAmountCents(null);
      setMemo("");
      setMsg({ ok: true, text: "Repasse registrado." });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void submit();
      }}
    >
      <p className="text-small text-ink-muted">
        Saldo a repassar à produtora: <strong className="text-ink">{fmtBRL(payableCents)}</strong>.
        Este registro não movimenta dinheiro — apenas informa um pagamento feito externamente.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Valor" htmlFor={`po-${eventId}`}>
          <MoneyInput id={`po-${eventId}`} valueCents={amountCents} onChangeCents={setAmountCents} />
        </Field>
        <Field label="Referência" htmlFor={`memo-${eventId}`}>
          <Input
            id={`memo-${eventId}`}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Ex.: Pix 28/07 — comprovante 1234"
          />
        </Field>
      </div>
      <div aria-live="polite">
        {msg && (
          <p className={msg.ok ? "text-small text-success-text" : "text-small text-danger"}>
            {msg.text}
          </p>
        )}
      </div>
      <Button type="submit" variant="outline" disabled={!valid} loading={busy}>
        Registrar repasse
      </Button>
    </form>
  );
}
