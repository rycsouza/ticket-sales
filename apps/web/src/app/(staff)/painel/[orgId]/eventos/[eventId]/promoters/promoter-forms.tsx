"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const short = (id: string) => id.slice(0, 8);

function useSubmit(reset: () => void) {
  const router = useRouter();
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
        return;
      }
      reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, send };
}

export function NewCouponForm({
  apiBase,
  promoterMembers,
}: {
  apiBase: string;
  promoterMembers: string[];
}) {
  const [form, setForm] = useState({ code: "", type: "PERCENT", value: "", membershipId: "" });
  const { busy, error, send } = useSubmit(() => setForm((f) => ({ ...f, code: "", value: "" })));

  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-brand-600">+ Novo cupom</summary>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body: Record<string, unknown> = {
            code: form.code.trim().toUpperCase(),
            type: form.type,
            // PERCENT: value in basis points; FIXED: value in cents.
            value:
              form.type === "PERCENT"
                ? Math.round(Number(form.value) * 100)
                : Math.round(Number(form.value) * 100),
          };
          if (form.membershipId) body.membershipId = form.membershipId;
          void send(`${apiBase}/coupons`, body);
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          <input className={`${input} col-span-1`} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="CÓDIGO" />
          <select className={input} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            <option value="PERCENT">% percentual</option>
            <option value="FIXED">R$ fixo</option>
          </select>
          <input className={input} type="number" min={0} step="0.01" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder={form.type === "PERCENT" ? "10 (=10%)" : "R$"} />
        </div>
        {promoterMembers.length > 0 && (
          <select className={input} value={form.membershipId} onChange={(e) => setForm((f) => ({ ...f, membershipId: e.target.value }))}>
            <option value="">Cupom da organização (sem promoter)</option>
            {promoterMembers.map((id) => (
              <option key={id} value={id}>
                Promoter #{short(id)}
              </option>
            ))}
          </select>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || form.code.trim().length < 3 || !form.value} className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-bold text-white active:bg-brand-600 disabled:opacity-40">
          {busy ? "Criando..." : "Criar cupom"}
        </button>
      </form>
    </details>
  );
}

export function NewRuleForm({
  apiBase,
  promoterMembers,
}: {
  apiBase: string;
  promoterMembers: string[];
}) {
  const [form, setForm] = useState({ type: "PERCENT", value: "", base: "NOMINAL", membershipId: "" });
  const { busy, error, send } = useSubmit(() => setForm((f) => ({ ...f, value: "" })));

  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-brand-600">+ Nova regra de comissão</summary>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body: Record<string, unknown> = {
            type: form.type,
            value:
              form.type === "PERCENT"
                ? Math.round(Number(form.value) * 100)
                : Math.round(Number(form.value) * 100),
            base: form.base,
          };
          if (form.membershipId) body.membershipId = form.membershipId;
          void send(`${apiBase}/commission-rules`, body);
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          <select className={input} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            <option value="PERCENT">% percentual</option>
            <option value="FIXED">R$ fixo/ing.</option>
          </select>
          <input className={input} type="number" min={0} step="0.01" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder={form.type === "PERCENT" ? "10" : "R$"} />
          <select className={input} value={form.base} onChange={(e) => setForm((f) => ({ ...f, base: e.target.value }))}>
            <option value="NOMINAL">nominal</option>
            <option value="AFTER_DISCOUNT">após desc.</option>
          </select>
        </div>
        {promoterMembers.length > 0 && (
          <select className={input} value={form.membershipId} onChange={(e) => setForm((f) => ({ ...f, membershipId: e.target.value }))}>
            <option value="">Todos os promoters</option>
            {promoterMembers.map((id) => (
              <option key={id} value={id}>
                Só promoter #{short(id)}
              </option>
            ))}
          </select>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || !form.value} className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-bold text-white active:bg-brand-600 disabled:opacity-40">
          {busy ? "Salvando..." : "Salvar regra"}
        </button>
      </form>
    </details>
  );
}
