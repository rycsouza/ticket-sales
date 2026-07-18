"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import type { PublicBatchView } from "@/lib/public-views";

function formatBRL(centsValue: number): string {
  return (centsValue / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Props {
  eventId: string;
  batches: PublicBatchView[];
  maxTicketsPerOrder: number | null;
  platformFeeBps: number;
  feeMode: "BUYER" | "PRODUCER";
  eventTerms: string | null;
  cancellationPolicy: string | null;
}

interface Utm {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

interface AppliedCoupon {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
}

const sectionClass = "rounded-xl border border-line bg-surface p-4";
const sectionTitle = "mb-3 text-small font-semibold uppercase tracking-wide text-ink-muted";

export function CheckoutForm({
  eventId,
  batches,
  maxTicketsPerOrder,
  platformFeeBps,
  feeMode,
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

  const [couponInput, setCouponInput] = useState("");
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [linkRef, setLinkRef] = useState<string | undefined>(undefined);
  const [utm, setUtm] = useState<Utm>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("p") ?? params.get("ref") ?? undefined;
    if (ref) setLinkRef(ref);
    const captured: Utm = {};
    const source = params.get("utm_source");
    const medium = params.get("utm_medium");
    const campaign = params.get("utm_campaign");
    const content = params.get("utm_content");
    const term = params.get("utm_term");
    if (source) captured.source = source;
    if (medium) captured.medium = medium;
    if (campaign) captured.campaign = campaign;
    if (content) captured.content = content;
    if (term) captured.term = term;
    setUtm(captured);
  }, []);

  const totalQuantity = useMemo(
    () => Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0),
    [quantities],
  );
  const subtotalCents = useMemo(
    () => batches.reduce((sum, batch) => sum + (quantities[batch.id] ?? 0) * batch.priceCents, 0),
    [batches, quantities],
  );
  const discountCents = useMemo(() => {
    if (!applied) return 0;
    const raw =
      applied.type === "PERCENT"
        ? Math.round((subtotalCents * Math.min(applied.value, 10_000)) / 10_000)
        : applied.value;
    return Math.max(0, Math.min(raw, subtotalCents));
  }, [applied, subtotalCents]);
  const netCents = subtotalCents - discountCents;
  const feeCents = useMemo(
    () =>
      feeMode === "BUYER" ? Math.round((netCents * Math.min(platformFeeBps, 10_000)) / 10_000) : 0,
    [feeMode, platformFeeBps, netCents],
  );
  const totalCents = netCents + feeCents;

  function setQuantity(batch: PublicBatchView, next: number) {
    const capped = Math.max(0, Math.min(next, batch.maxPerOrder ?? 20, maxTicketsPerOrder ?? 20));
    setQuantities((current) => ({ ...current, [batch.id]: capped }));
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCheckingCoupon(true);
    setCouponMsg(null);
    try {
      const response = await fetch(`/api/public/events/${eventId}/coupon-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as {
        valid?: boolean;
        type?: "PERCENT" | "FIXED";
        value?: number;
        message?: string;
        error?: string;
      };
      if (response.ok && data.valid && data.type && typeof data.value === "number") {
        setApplied({ code, type: data.type, value: data.value });
        setCouponMsg(null);
      } else {
        setApplied(null);
        setCouponMsg(data.message ?? data.error ?? "Cupom inválido.");
      }
    } catch {
      setCouponMsg("Não foi possível validar o cupom agora.");
    } finally {
      setCheckingCoupon(false);
    }
  }

  function removeCoupon() {
    setApplied(null);
    setCouponInput("");
    setCouponMsg(null);
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

      const hasUtm = Object.keys(utm).length > 0;
      const couponToSend = applied?.code ?? (couponInput.trim() || undefined);

      const response = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          items,
          buyer: { name: name.trim(), email: email.trim().toLowerCase() },
          ...(couponToSend ? { coupon: couponToSend } : {}),
          ...(linkRef ? { ref: linkRef } : {}),
          ...(hasUtm ? { utm } : {}),
        }),
      });
      const data = (await response.json()) as { code?: string; error?: string };

      if (!response.ok || !data.code) {
        setError(data.error ?? "Não foi possível criar o pedido. Tente novamente.");
        return;
      }

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
      <section className={`${sectionClass} text-center text-body text-ink-muted`}>
        As vendas ainda não estão abertas para este evento.
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className={sectionClass}>
        <h2 className={sectionTitle}>Ingressos</h2>
        <ul className="divide-y divide-line">
          {batches.map((batch) => {
            const quantity = quantities[batch.id] ?? 0;
            return (
              <li key={batch.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{batch.ticketTypeName}</p>
                  <p className="text-small text-ink-muted">{batch.name}</p>
                  <p className="mt-1 text-body font-semibold text-brand">
                    {formatBRL(batch.priceCents)}
                  </p>
                </div>
                {batch.available ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Remover ${batch.ticketTypeName}`}
                      onClick={() => setQuantity(batch, quantity - 1)}
                      className="flex size-11 items-center justify-center rounded-full border border-line-strong text-ink-soft transition-colors active:bg-hover disabled:opacity-30"
                      disabled={quantity === 0}
                    >
                      <Minus className="size-5" />
                    </button>
                    <span className="w-6 text-center text-body font-semibold tabular-nums text-ink">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Adicionar ${batch.ticketTypeName}`}
                      onClick={() => setQuantity(batch, quantity + 1)}
                      className="flex size-11 items-center justify-center rounded-full bg-brand text-brand-fg transition-colors active:bg-brand-active"
                    >
                      <Plus className="size-5" />
                    </button>
                  </div>
                ) : (
                  <span className="rounded-full bg-hover px-3 py-1 text-small font-semibold text-ink-muted">
                    Esgotado
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className={sectionClass}>
        <h2 className={sectionTitle}>Cupom</h2>
        {applied ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-success-border bg-success-bg px-3 py-3">
            <span className="text-body font-medium text-success-text">
              Cupom <strong>{applied.code}</strong> aplicado
              {subtotalCents > 0 ? ` — ${formatBRL(discountCents)} de desconto` : ""}
            </span>
            <button
              type="button"
              onClick={removeCoupon}
              className="text-body font-semibold text-success-text underline"
            >
              Remover
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              type="text"
              value={couponInput}
              onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
              className="uppercase"
              placeholder="Tem um cupom?"
              autoCapitalize="characters"
            />
            <Button
              variant="outline"
              loading={checkingCoupon}
              disabled={couponInput.trim().length === 0}
              onClick={applyCoupon}
            >
              Aplicar
            </Button>
          </div>
        )}
        {couponMsg && <p className="mt-2 text-body text-danger">{couponMsg}</p>}
      </div>

      <div className={sectionClass}>
        <h2 className={sectionTitle}>Seus dados</h2>
        <div className="space-y-3">
          <Field label="Nome completo" htmlFor="ck-name">
            <Input
              id="ck-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              placeholder="Como no seu documento"
            />
          </Field>
          <Field label="E-mail" htmlFor="ck-email">
            <Input
              id="ck-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder="Seus ingressos chegam aqui"
            />
          </Field>
        </div>
      </div>

      {(eventTerms || cancellationPolicy) && (
        <details className={`${sectionClass} text-body text-ink-soft`}>
          <summary className="cursor-pointer font-medium text-ink">
            Termos e política de cancelamento
          </summary>
          {cancellationPolicy && <p className="mt-2 whitespace-pre-line">{cancellationPolicy}</p>}
          {eventTerms && <p className="mt-2 whitespace-pre-line">{eventTerms}</p>}
        </details>
      )}

      <label className={`flex items-start gap-3 ${sectionClass} text-body text-ink-soft`}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-0.5 size-5 accent-brand"
        />
        <span>Li e aceito os termos do evento e a política de privacidade.</span>
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-body text-danger-text"
        >
          {error}
        </p>
      )}

      {totalQuantity > 0 && (discountCents > 0 || feeCents > 0) && (
        <div className={`${sectionClass} text-body`}>
          <div className="flex justify-between text-ink-soft">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatBRL(subtotalCents)}</span>
          </div>
          {discountCents > 0 && (
            <div className="flex justify-between text-success-text">
              <span>Desconto</span>
              <span className="tabular-nums">−{formatBRL(discountCents)}</span>
            </div>
          )}
          {feeCents > 0 && (
            <div className="flex justify-between text-ink-soft">
              <span>Taxa de serviço</span>
              <span className="tabular-nums">{formatBRL(feeCents)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink">
            <span>Total</span>
            <span className="tabular-nums">{formatBRL(totalCents)}</span>
          </div>
        </div>
      )}

      <div className="sticky bottom-4">
        <Button
          size="lg"
          className="w-full shadow-lg"
          loading={submitting}
          onClick={submit}
        >
          {totalQuantity > 0 ? `Continuar — ${formatBRL(totalCents)}` : "Continuar"}
        </Button>
        {totalQuantity > 0 && (
          <p className="mt-2 text-center text-small text-ink-muted">
            {totalQuantity} {totalQuantity === 1 ? "ingresso" : "ingressos"} · preço final, sem
            taxas escondidas
          </p>
        )}
      </div>
    </section>
  );
}
