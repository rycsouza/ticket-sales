"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";

type PromoterOption = { id: string; name: string };

const summaryClass =
  "inline-flex cursor-pointer list-none items-center gap-1.5 text-small font-semibold text-brand [&::-webkit-details-marker]:hidden";

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
  promoters,
}: {
  apiBase: string;
  promoters: PromoterOption[];
}) {
  const [form, setForm] = useState({ code: "", type: "PERCENT", value: "", promoterId: "" });
  const { busy, error, send } = useSubmit(() => setForm((f) => ({ ...f, code: "", value: "" })));

  return (
    <details>
      <summary className={summaryClass}>
        <Plus className="size-4" />
        Novo cupom
      </summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const body: Record<string, unknown> = {
            code: form.code.trim().toUpperCase(),
            type: form.type,
            value: Math.round(Number(form.value) * 100),
          };
          if (form.promoterId) body.promoterId = form.promoterId;
          void send(`${apiBase}/coupons`, body);
        }}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Código">
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="CÓDIGO"
            />
          </Field>
          <Field label="Tipo">
            <Select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="PERCENT">% percentual</option>
              <option value="FIXED">R$ fixo</option>
            </Select>
          </Field>
          <Field label="Valor">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder={form.type === "PERCENT" ? "10" : "R$"}
            />
          </Field>
        </div>
        {promoters.length > 0 && (
          <Field label="Promoter (opcional)">
            <Select
              value={form.promoterId}
              onChange={(e) => setForm((f) => ({ ...f, promoterId: e.target.value }))}
            >
              <option value="">Cupom da organização (sem promoter)</option>
              {promoters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {error && <p className="text-small text-danger">{error}</p>}
        <Button type="submit" loading={busy} disabled={form.code.trim().length < 3 || !form.value}>
          Criar cupom
        </Button>
      </form>
    </details>
  );
}

export function NewRuleForm({
  apiBase,
  promoters,
}: {
  apiBase: string;
  promoters: PromoterOption[];
}) {
  const [form, setForm] = useState({ type: "PERCENT", value: "", base: "NOMINAL", promoterId: "" });
  const { busy, error, send } = useSubmit(() => setForm((f) => ({ ...f, value: "" })));

  return (
    <details>
      <summary className={summaryClass}>
        <Plus className="size-4" />
        Nova regra de comissão
      </summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const body: Record<string, unknown> = {
            type: form.type,
            value: Math.round(Number(form.value) * 100),
            base: form.base,
          };
          if (form.promoterId) body.promoterId = form.promoterId;
          void send(`${apiBase}/commission-rules`, body);
        }}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Tipo">
            <Select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="PERCENT">% percentual</option>
              <option value="FIXED">R$ fixo/ing.</option>
            </Select>
          </Field>
          <Field label="Valor">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder={form.type === "PERCENT" ? "10" : "R$"}
            />
          </Field>
          <Field label="Base de cálculo">
            <Select
              value={form.base}
              onChange={(e) => setForm((f) => ({ ...f, base: e.target.value }))}
            >
              <option value="NOMINAL">Sobre o valor cheio</option>
              <option value="AFTER_DISCOUNT">Sobre o valor com desconto</option>
            </Select>
          </Field>
        </div>
        {promoters.length > 0 && (
          <Field label="Aplicar a">
            <Select
              value={form.promoterId}
              onChange={(e) => setForm((f) => ({ ...f, promoterId: e.target.value }))}
            >
              <option value="">Todos os promoters</option>
              {promoters.map((p) => (
                <option key={p.id} value={p.id}>
                  Só {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {error && <p className="text-small text-danger">{error}</p>}
        <Button type="submit" loading={busy} disabled={!form.value}>
          Salvar regra
        </Button>
      </form>
    </details>
  );
}
