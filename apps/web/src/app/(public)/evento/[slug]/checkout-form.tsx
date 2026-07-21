"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Minus, Plus } from "lucide-react";
import { Button, Field, Input, PhoneInput } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  isCompleteMobilePhone,
  isValidEmail,
  isValidFullName,
  sanitizeEmail,
  sanitizeName,
  titleCaseName,
} from "@/lib/format";
import type { PublicBatchView } from "@/lib/public-views";
import { useCheckoutStep } from "./checkout-flow";

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

type Lookup =
  | { status: "idle" | "checking" | "none" }
  | { status: "found"; maskedName: string | null; maskedEmail: string | null };

const sectionClass = "rounded-xl border border-line bg-surface p-4";
const sectionTitle = "mb-3 text-small font-semibold uppercase tracking-wide text-ink-muted";
const STEP_LABELS = ["Ingressos", "Seus dados", "Revisão"];

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
  // Step lives in shared context so the surrounding marketing blocks can hide
  // once the buyer advances past ticket selection (StepOneOnly in checkout-flow).
  const { step, setStep } = useCheckoutStep();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Returning-buyer lookup by phone (masked preview only).
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [useOther, setUseOther] = useState(false);
  const [touched, setTouched] = useState({ phone: false, name: false, email: false });

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

  // On a real step change, jump to the top: advancing hides the blocks above
  // the checkout, so the next step must start from the top of the viewport.
  const prevStep = useRef(step);
  useEffect(() => {
    if (prevStep.current !== step) {
      prevStep.current = step;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step]);

  // `phone` holds digits only (PhoneInput handles the mask).
  const phoneComplete = isCompleteMobilePhone(phone);

  // Debounced lookup — fires ONLY once the number reaches its ideal size (a
  // full BR mobile), never on partial input.
  useEffect(() => {
    if (!phoneComplete) {
      setLookup({ status: "idle" });
      return;
    }
    let cancelled = false;
    setLookup({ status: "checking" });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/public/events/${eventId}/customer-lookup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          found?: boolean;
          maskedName?: string | null;
          maskedEmail?: string | null;
        };
        if (cancelled) return;
        if (res.ok && data.found) {
          setLookup({
            status: "found",
            maskedName: data.maskedName ?? null,
            maskedEmail: data.maskedEmail ?? null,
          });
          setUseOther(false);
        } else {
          setLookup({ status: "none" });
        }
      } catch {
        if (!cancelled) setLookup({ status: "none" });
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [phone, phoneComplete, eventId]);

  const reuseActive = lookup.status === "found" && !useOther;

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

  const nameValid = isValidFullName(name);
  const emailValid = isValidEmail(email);
  // Only ask for name/e-mail after the phone lookup resolves without a match
  // (or when the buyer opts out of the found cadastro). Until then, only the
  // WhatsApp field is shown.
  const showIdentityFields = !reuseActive && (lookup.status === "none" || useOther);
  const dataStepValid =
    phoneComplete && (reuseActive || (showIdentityFields && nameValid && emailValid));

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

  function goToData() {
    if (totalQuantity === 0) {
      setError("Selecione pelo menos um ingresso.");
      return;
    }
    setError(null);
    setStep(2);
  }

  function goToReview() {
    if (!dataStepValid) {
      setError("Informe seu WhatsApp e seus dados para continuar.");
      return;
    }
    setError(null);
    setStep(3);
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const items = Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([batchId, quantity]) => ({ batchId, quantity }));

      const hasUtm = Object.keys(utm).length > 0;
      const couponToSend = applied?.code ?? (couponInput.trim() || undefined);
      // Reuse path sends only the phone; the server fills name/e-mail from the
      // existing customer (the real values are never exposed to the client).
      const buyer = reuseActive
        ? { phone }
        : { phone, name: name.trim(), email: email.trim().toLowerCase() };

      const response = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          items,
          buyer,
          ...(couponToSend ? { coupon: couponToSend } : {}),
          ...(linkRef ? { ref: linkRef } : {}),
          ...(hasUtm ? { utm } : {}),
        }),
      });
      const data = (await response.json()) as {
        code?: string;
        accessToken?: string | null;
        error?: string;
      };

      if (!response.ok || !data.code) {
        setError(data.error ?? "Não foi possível criar o pedido. Tente novamente.");
        return;
      }

      // Prefer the access token (Print 4): the order page tracks + generates the
      // Pix automatically, with no e-mail re-entry — works for reuse buyers too.
      // Fall back to code+e-mail only when a token was not issued.
      const stored = data.accessToken
        ? { code: data.code, token: data.accessToken }
        : reuseActive
          ? { code: data.code }
          : { code: data.code, email: email.trim().toLowerCase() };
      sessionStorage.setItem("ingressos:last-order", JSON.stringify(stored));
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

  const errorBox = error && (
    <p
      role="alert"
      className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-body text-danger-text"
    >
      {error}
    </p>
  );

  return (
    <section className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          {STEP_LABELS.map((label, i) => (
            <div
              key={label}
              className={cn("h-1.5 flex-1 rounded-full", i + 1 <= step ? "bg-brand" : "bg-hover")}
            />
          ))}
        </div>
        <p className="mt-2 text-small font-medium text-ink-muted">
          Passo {step} de 3 · {STEP_LABELS[step - 1]}
        </p>
      </div>

      {/* Step 1 — Ingressos */}
      {step === 1 && (
        <>
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
          {errorBox}
          {/* In-flow (not floating): step 1 is all about interacting with the
              cart, so a sticky bar would overlap the quantity controls. */}
          <Button size="lg" className="w-full" disabled={totalQuantity === 0} onClick={goToData}>
            {totalQuantity > 0 ? `Continuar — ${formatBRL(subtotalCents)}` : "Continuar"}
          </Button>
        </>
      )}

      {/* Step 2 — Seus dados (phone-first) */}
      {step === 2 && (
        <>
          <div className={sectionClass}>
            <h2 className={sectionTitle}>Seus dados</h2>
            <div className="space-y-3">
              <Field
                label="WhatsApp"
                htmlFor="ck-phone"
                hint="Celular com DDD. Usamos para agilizar sua compra e avisar do pedido."
                error={
                  touched.phone && !phoneComplete
                    ? "Informe um WhatsApp válido com DDD."
                    : undefined
                }
              >
                <PhoneInput
                  id="ck-phone"
                  value={phone}
                  onChange={setPhone}
                  onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                  invalid={touched.phone && !phoneComplete}
                />
              </Field>

              {lookup.status === "checking" && (
                <p className="text-small text-ink-muted">Verificando cadastro…</p>
              )}

              {reuseActive && lookup.status === "found" && (
                <div className="rounded-lg border border-success-border bg-success-bg p-3">
                  <p className="flex items-center gap-1.5 text-small font-semibold text-success-text">
                    <Check className="size-4" /> Cadastro encontrado
                  </p>
                  <p className="mt-1 text-body text-ink">{lookup.maskedName}</p>
                  <p className="text-small text-ink-muted">{lookup.maskedEmail}</p>
                  <button
                    type="button"
                    onClick={() => setUseOther(true)}
                    className="mt-2 text-small font-medium text-success-text underline"
                  >
                    Usar outros dados
                  </button>
                </div>
              )}

              {showIdentityFields && (
                <>
                  <Field
                    label="Nome completo"
                    htmlFor="ck-name"
                    error={
                      touched.name && !nameValid
                        ? "Informe nome e sobrenome (apenas letras)."
                        : undefined
                    }
                  >
                    <Input
                      id="ck-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(sanitizeName(e.target.value))}
                      onBlur={() => {
                        setName((n) => titleCaseName(n));
                        setTouched((t) => ({ ...t, name: true }));
                      }}
                      aria-invalid={touched.name && !nameValid ? true : undefined}
                      autoComplete="name"
                      autoCapitalize="words"
                      maxLength={120}
                      placeholder="Como no seu documento"
                    />
                  </Field>
                  <Field
                    label="E-mail"
                    htmlFor="ck-email"
                    error={touched.email && !emailValid ? "Informe um e-mail válido." : undefined}
                  >
                    <Input
                      id="ck-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(sanitizeEmail(e.target.value))}
                      onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                      aria-invalid={touched.email && !emailValid ? true : undefined}
                      autoComplete="email"
                      inputMode="email"
                      maxLength={254}
                      placeholder="Seus ingressos chegam aqui"
                    />
                  </Field>
                </>
              )}
            </div>
          </div>
          {errorBox}
          <StickyBar>
            <div className="flex gap-2">
              <Button variant="outline" size="lg" leftIcon={<ArrowLeft className="size-[18px]" />} onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button size="lg" className="flex-1" disabled={!dataStepValid} onClick={goToReview}>
                Continuar
              </Button>
            </div>
          </StickyBar>
        </>
      )}

      {/* Step 3 — Revisão */}
      {step === 3 && (
        <>
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
            <h2 className={sectionTitle}>Resumo</h2>
            <ul className="divide-y divide-line">
              {batches
                .filter((b) => (quantities[b.id] ?? 0) > 0)
                .map((b) => (
                  <li key={b.id} className="flex items-center justify-between py-2 text-body">
                    <span className="text-ink">
                      {quantities[b.id]}× {b.ticketTypeName}
                      <span className="text-ink-muted"> · {b.name}</span>
                    </span>
                    <span className="tabular-nums text-ink">
                      {formatBRL((quantities[b.id] ?? 0) * b.priceCents)}
                    </span>
                  </li>
                ))}
            </ul>
            <div className="mt-3 space-y-1 border-t border-line pt-3 text-body">
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
              <div className="flex justify-between pt-1 text-h3 font-bold text-ink">
                <span>Total</span>
                <span className="tabular-nums">{formatBRL(totalCents)}</span>
              </div>
            </div>
          </div>

          <div className={`${sectionClass} text-body text-ink-soft`}>
            {reuseActive && lookup.status === "found" ? (
              <p>
                Comprador: <strong className="text-ink">{lookup.maskedName}</strong> ·{" "}
                {lookup.maskedEmail}
              </p>
            ) : (
              <p>
                Comprador: <strong className="text-ink">{name}</strong> · {email}
              </p>
            )}
          </div>

          {(eventTerms || cancellationPolicy) && (
            <details className={`${sectionClass} text-body text-ink-soft`}>
              <summary className="cursor-pointer font-medium text-ink">
                Termos e política de cancelamento
              </summary>
              {cancellationPolicy && (
                <p className="mt-2 whitespace-pre-line">{cancellationPolicy}</p>
              )}
              {eventTerms && <p className="mt-2 whitespace-pre-line">{eventTerms}</p>}
            </details>
          )}

          {errorBox}
          <StickyBar>
            <div className="flex gap-2">
              <Button variant="outline" size="lg" leftIcon={<ArrowLeft className="size-[18px]" />} onClick={() => setStep(2)}>
                Voltar
              </Button>
              <Button size="lg" className="flex-1" loading={submitting} onClick={submit}>
                Finalizar — {formatBRL(totalCents)}
              </Button>
            </div>
            <p className="mt-2 text-center text-small text-ink-muted">
              Ao finalizar, você concorda com os termos do evento e a política de privacidade.
            </p>
          </StickyBar>
        </>
      )}
    </section>
  );
}

function StickyBar({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-4">{children}</div>;
}
