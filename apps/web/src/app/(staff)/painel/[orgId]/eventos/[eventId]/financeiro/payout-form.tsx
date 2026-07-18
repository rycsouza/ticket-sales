"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

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
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <input className={input} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Valor R$" />
        <input className={input} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Referência (PIX, TED...)" />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {ok && <p className="text-sm text-green-700">Repasse registrado.</p>}
      <button
        type="submit"
        disabled={busy || !amount || memo.trim().length < 3}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-bold text-white active:bg-brand-600 disabled:opacity-40"
      >
        {busy ? "Registrando..." : "Registrar repasse"}
      </button>
    </form>
  );
}
