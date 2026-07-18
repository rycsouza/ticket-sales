"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicBatchView } from "@/lib/public-views";

function formatBRL(centsValue: number): string {
  return (centsValue / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Props {
  eventId: string;
  batches: PublicBatchView[];
  maxTicketsPerOrder: number | null;
  eventTerms: string | null;
  cancellationPolicy: string | null;
}

export function CheckoutForm({
  eventId,
  batches,
  maxTicketsPerOrder,
  eventTerms,
  cancellationPolicy,
}: Props) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalQuantity = useMemo(
    () => Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0),
    [quantities],
  );
  const totalCents = useMemo(
    () =>
      batches.reduce(
        (sum, batch) => sum + (quantities[batch.id] ?? 0) * batch.priceCents,
        0,
      ),
    [batches, quantities],
  );

  function setQuantity(batch: PublicBatchView, next: number) {
    const capped = Math.max(
      0,
      Math.min(next, batch.maxPerOrder ?? 20, maxTicketsPerOrder ?? 20),
    );
    setQuantities((current) => ({ ...current, [batch.id]: capped }));
  }

  async function submit() {
    setError(null);
    if (totalQuantity === 0) {
      setError("Selecione pelo menos um ingresso.");
      return;
    }
    if (!accepted) {
      setError("É preciso aceitar os termos para continuar.");
      return;
    }
    setSubmitting(true);
    try {
      const items = Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([batchId, quantity]) => ({ batchId, quantity }));

      const response = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          items,
          buyer: { name: name.trim(), email: email.trim().toLowerCase() },
        }),
      });
      const data = (await response.json()) as { code?: string; error?: string };

      if (!response.ok || !data.code) {
        setError(data.error ?? "Não foi possível criar o pedido. Tente novamente.");
        return;
      }

      // Credentials for the order page — session storage, never the URL
      sessionStorage.setItem(
        "ingressos:last-order",
        JSON.stringify({ code: data.code, email: email.trim().toLowerCase() }),
      );
      router.push("/pedido");
    } catch {
      setError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (batches.length === 0) {
    return (
      <section className="rounded-xl bg-white p-6 text-center text-sm text-ink-600 shadow-sm">
        As vendas ainda não estão abertas para este evento.
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">
          Ingressos
        </h2>
        <ul className="divide-y divide-slate-100">
          {batches.map((batch) => {
            const quantity = quantities[batch.id] ?? 0;
            return (
              <li key={batch.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{batch.ticketTypeName}</p>
                  <p className="text-xs text-ink-400">{batch.name}</p>
                  <p className="mt-1 text-sm font-semibold text-brand-600">
                    {formatBRL(batch.priceCents)}
                  </p>
                </div>
                {batch.available ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Remover ${batch.ticketTypeName}`}
                      onClick={() => setQuantity(batch, quantity - 1)}
                      className="h-11 w-11 rounded-full border border-slate-200 text-lg font-bold text-ink-600 active:bg-slate-100 disabled:opacity-30"
                      disabled={quantity === 0}
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-base font-semibold tabular-nums">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Adicionar ${batch.ticketTypeName}`}
                      onClick={() => setQuantity(batch, quantity + 1)}
                      className="h-11 w-11 rounded-full bg-brand-500 text-lg font-bold text-white active:bg-brand-600"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-400">
                    Esgotado
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">
          Seus dados
        </h2>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Nome completo</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className="w-full rounded-lg border border-slate-200 px-3 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="Como no seu documento"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              className="w-full rounded-lg border border-slate-200 px-3 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="Seus ingressos chegam aqui"
            />
          </label>
        </div>
      </div>

      {(eventTerms || cancellationPolicy) && (
        <details className="rounded-xl bg-white p-4 text-sm text-ink-600 shadow-sm">
          <summary className="cursor-pointer font-medium text-ink-900">
            Termos e política de cancelamento
          </summary>
          {cancellationPolicy && <p className="mt-2 whitespace-pre-line">{cancellationPolicy}</p>}
          {eventTerms && <p className="mt-2 whitespace-pre-line">{eventTerms}</p>}
        </details>
      )}

      <label className="flex items-start gap-3 rounded-xl bg-white p-4 text-sm shadow-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-0.5 h-5 w-5 accent-brand-500"
        />
        <span>
          Li e aceito os termos do evento e a política de privacidade. {/* FR-CHK-012 */}
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="sticky bottom-4">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full rounded-xl bg-brand-500 py-4 text-base font-bold text-white shadow-lg shadow-blue-200 active:bg-brand-600 disabled:opacity-60"
        >
          {submitting
            ? "Reservando..."
            : totalQuantity > 0
              ? `Continuar — ${formatBRL(totalCents)}`
              : "Continuar"}
        </button>
        {totalQuantity > 0 && (
          <p className="mt-2 text-center text-xs text-ink-400">
            {totalQuantity} {totalQuantity === 1 ? "ingresso" : "ingressos"} · preço final, sem
            taxas escondidas
          </p>
        )}
      </div>
    </section>
  );
}
