"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";

export function PayoutForm({ apiBase }: { apiBase: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/payouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: Math.round(Number(amount) * 100), memo: memo.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Falha ao registrar.");
        return;
      }
      setAmount("");
      setMemo("");
      setOk(true);
      setTimeout(() => setOk(false), 2000);
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" htmlFor="po-amount">
          <Input
            id="po-amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Referência" htmlFor="po-memo">
          <Input
            id="po-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="PIX, TED..."
          />
        </Field>
      </div>
      {error && <p className="text-small text-danger">{error}</p>}
      {ok && <p className="text-small text-success-text">Repasse registrado.</p>}
      <Button type="submit" loading={busy} disabled={!amount || memo.trim().length < 3}>
        Registrar repasse
      </Button>
    </form>
  );
}
