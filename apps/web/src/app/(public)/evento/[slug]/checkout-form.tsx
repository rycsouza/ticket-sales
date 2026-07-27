"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CreditCard, Minus, Plus, QrCode } from "lucide-react";
import { Button, Field, Input, PhoneInput, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  isCompleteMobilePhone,
  isValidEmail,
  isValidFullName,
  sanitizeEmail,
  sanitizeName,
  titleCaseName,
} from "@/lib/format";
import { getStoredPhone, setStoredPhone } from "@/lib/prefs";
import type { PublicBatchView, PublicOfferView } from "@/lib/public-views";
import {
  OrderPayment,
  type OrderAccess,
  type OrderView,
  type PixView,
} from "@/components/order-payment";
import { useCheckoutStep } from "./checkout-flow";

function formatBRL(centsValue: number): string {
  return (centsValue / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Props {
  eventId: string;
  batches: PublicBatchView[];
  offers: PublicOfferView[];
  maxTicketsPerOrder: number | null;
  platformFeeBps: number;
  feeMode: "BUYER" | "PRODUCER";
  eventTerms: string | null;
  cancellationPolicy: string | null;
  /** Public key for the card Brick (Pagamento step). Absent → Pix only. */
  mpPublicKey: string | null;
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
const STEP_LABELS = ["Ingressos", "Seus dados", "Revisão", "Pagamento"];
// Friendly, reassuring messages shown while the order + payment are prepared.
const PREP_MESSAGES = [
  "Reservando seus ingressos…",
  "Gerando seu pagamento…",
  "Preparando tudo pra você…",
  "Quase lá…",
];

export function CheckoutForm({
  eventId,
  batches,
  offers,
  maxTicketsPerOrder,
  platformFeeBps,
  feeMode,
  eventTerms,
  cancellationPolicy,
  mpPublicKey,
}: Props) {
  const router = useRouter();
  // Set once the order is created — drives the in-flow Pagamento step (4).
  const [access, setAccess] = useState<OrderAccess | null>(null);
  // Resolved order + generated Pix, so step 4 lands on a ready screen (no wait).
  const [initialOrder, setInitialOrder] = useState<OrderView | null>(null);
  const [initialPix, setInitialPix] = useState<PixView | null>(null);
  const [prepMsg, setPrepMsg] = useState(0);
  // Step lives in shared context so the surrounding marketing blocks can hide
  // once the buyer advances past ticket selection (StepOneOnly in checkout-flow).
  const { step, setStep } = useCheckoutStep();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // Selected upsell / order-bump offers (offerId → true). One unit each.
  const [selectedOffers, setSelectedOffers] = useState<Record<string, boolean>>({});
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Payment method chosen on the review step (3). Card is only offered when the
  // MP public key is present; otherwise Pix is the only option. The order's
  // payment is generated for this method only (step 4 can still switch).
  const cardAvailable = mpPublicKey !== null;
  const [payMethod, setPayMethod] = useState<"pix" | "card">("pix");

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
    // Prefill the WhatsApp from a previous purchase on this device (triggers
    // the returning-buyer lookup automatically). The buyer can always edit it.
    const savedPhone = getStoredPhone();
    if (savedPhone) setPhone(savedPhone);
  }, []);

  // On a real step change, jump to the top: advancing hides the blocks above
  // the checkout, so the next step must start from the top of the viewport.
  // Fire the lead-capture once per session (best-effort, non-blocking).
  const leadSent = useRef(false);
  const prevStep = useRef(step);
  useEffect(() => {
    if (prevStep.current !== step) {
      prevStep.current = step;
      // Instant (not smooth): advancing collapses the blocks above the checkout,
      // and a smooth animation fights the height change — reads as janky on mobile.
      window.scrollTo({ top: 0 });
    }
  }, [step]);

  // Rotate the reassuring messages while the order + payment are being prepared.
  useEffect(() => {
    if (!submitting) {
      setPrepMsg(0);
      return;
    }
    const t = setInterval(() => setPrepMsg((i) => (i + 1) % PREP_MESSAGES.length), 1400);
    return () => clearInterval(t);
  }, [submitting]);

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
  const batchSubtotalCents = useMemo(
    () => batches.reduce((sum, batch) => sum + (quantities[batch.id] ?? 0) * batch.priceCents, 0),
    [batches, quantities],
  );
  // Split selected offers exactly as the server does: ticket-target offers join
  // the ticket subtotal (and the fee base); product-target offers are add-ons.
  const chosenOffers = useMemo(
    () => offers.filter((offer) => selectedOffers[offer.id]),
    [offers, selectedOffers],
  );
  const offerTicketCents = useMemo(
    () => chosenOffers.filter((o) => o.isTicket).reduce((s, o) => s + o.priceCents, 0),
    [chosenOffers],
  );
  const offerProductCents = useMemo(
    () => chosenOffers.filter((o) => !o.isTicket).reduce((s, o) => s + o.priceCents, 0),
    [chosenOffers],
  );
  // Ticket subtotal drives the coupon + platform fee (BR-FIN); add-ons don't.
  const ticketSubtotalCents = batchSubtotalCents + offerTicketCents;
  const subtotalCents = ticketSubtotalCents + offerProductCents;
  const discountCents = useMemo(() => {
    if (!applied) return 0;
    const raw =
      applied.type === "PERCENT"
        ? Math.round((ticketSubtotalCents * Math.min(applied.value, 10_000)) / 10_000)
        : applied.value;
    return Math.max(0, Math.min(raw, ticketSubtotalCents));
  }, [applied, ticketSubtotalCents]);
  const ticketNetCents = ticketSubtotalCents - discountCents;
  const feeCents = useMemo(
    () =>
      feeMode === "BUYER"
        ? Math.round((ticketNetCents * Math.min(platformFeeBps, 10_000)) / 10_000)
        : 0,
    [feeMode, platformFeeBps, ticketNetCents],
  );
  const totalCents = ticketNetCents + offerProductCents + feeCents;

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
    // Lead capture: persist a NEW contact as soon as they leave "Seus dados",
    // even if they never pay (funnel base). Reuse buyers already exist; skip.
    if (showIdentityFields && !leadSent.current && nameValid && emailValid && phoneComplete) {
      leadSent.current = true;
      void fetch(`/api/public/events/${eventId}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), phone }),
      }).catch(() => {
        leadSent.current = false; // allow a retry on the next attempt
      });
    }
    setStep(3);
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const items = Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([batchId, quantity]) => ({ batchId, quantity }));

      // Selected upsell / order-bump offers — one unit each. The price and
      // target are re-resolved server-side; we only send the id.
      const selectedOfferPayload = offers
        .filter((offer) => selectedOffers[offer.id])
        .map((offer) => ({ offerId: offer.id, quantity: 1 }));

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
          ...(selectedOfferPayload.length > 0 ? { offers: selectedOfferPayload } : {}),
          ...(couponToSend ? { coupon: couponToSend } : {}),
          ...(linkRef ? { ref: linkRef } : {}),
          ...(hasUtm ? { utm } : {}),
        }),
      });
      const data = (await response.json()) as {
        code?: string;
        accessToken?: string | null;
        status?: string;
        totalCents?: number;
        expiresAt?: string | null;
        error?: string;
      };

      if (!response.ok || !data.code) {
        setError(data.error ?? "Não foi possível criar o pedido. Tente novamente.");
        return;
      }

      // Remember the WhatsApp on this device so the next purchase skips typing.
      setStoredPhone(phone);

      // Prefer the access token (Print 4): resolves the order without re-asking
      // the e-mail — works for reuse buyers too. Store it so /pedido can reopen
      // the order later, and advance to the in-flow Pagamento step (4).
      const buyerEmail = email.trim().toLowerCase();
      const stored = data.accessToken
        ? { code: data.code, token: data.accessToken }
        : reuseActive
          ? { code: data.code }
          : { code: data.code, email: buyerEmail };
      sessionStorage.setItem("ingressos:last-order", JSON.stringify(stored));

      const nextAccess: OrderAccess | null = data.accessToken
        ? { token: data.accessToken }
        : reuseActive
          ? null // no client-side credential without a token (should not happen in prod)
          : { code: data.code, email: buyerEmail };

      if (nextAccess) {
        // Resolve the order + generate the chosen payment BEFORE advancing, so
        // the buyer lands on a ready screen (QR already visible) instead of a
        // spinner. The reassuring messages play while this runs.
        setInitialOrder({
          code: data.code,
          status: data.status ?? "AWAITING_PAYMENT",
          totalCents: data.totalCents ?? totalCents,
          expiresAt: data.expiresAt ?? null,
        });
        if (payMethod === "pix") {
          try {
            const payRes = await fetch("/api/public/orders/pay", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(nextAccess),
            });
            const payData = (await payRes.json().catch(() => ({}))) as PixView & {
              error?: string;
            };
            if (payRes.ok) setInitialPix(payData);
          } catch {
            // Non-fatal: OrderPayment regenerates the Pix lazily on the next step.
          }
        }
        setAccess(nextAccess);
        setStep(4);
      } else {
        // Degraded fallback: no in-flow credential — hand off to /pedido.
        router.push("/pedido");
      }
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
    <section className="space-y-4 pb-24 sm:pb-0">
      <StepIndicator current={step} />

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

          {/* Upsell — sugestões após escolher os ingressos (FR-CHK). */}
          {totalQuantity > 0 && offers.some((o) => o.kind === "UPSELL") && (
            <div className={sectionClass}>
              <h2 className={sectionTitle}>Que tal aproveitar?</h2>
              <div className="space-y-2">
                {offers
                  .filter((o) => o.kind === "UPSELL")
                  .map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      checked={!!selectedOffers[offer.id]}
                      onToggle={(next) =>
                        setSelectedOffers((prev) => ({ ...prev, [offer.id]: next }))
                      }
                    />
                  ))}
              </div>
            </div>
          )}
          {errorBox}
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
                <div className="rounded-lg border border-brand-border bg-brand-soft p-3">
                  <p className="flex items-center gap-1.5 text-small font-semibold text-brand">
                    <Check className="size-4" /> Cadastro encontrado
                  </p>
                  <p className="mt-1 text-body text-ink">{lookup.maskedName}</p>
                  <p className="text-small text-ink-muted">{lookup.maskedEmail}</p>
                  <button
                    type="button"
                    onClick={() => setUseOther(true)}
                    className="mt-2 text-small font-medium text-brand underline"
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
        </>
      )}

      {/* Step 3 — Revisão */}
      {step === 3 && (
        <>
          {cardAvailable && (
            <div className={`${sectionClass} border-brand-border`}>
              <h2 className={sectionTitle}>Como você quer pagar?</h2>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: "pix", label: "Pix", icon: QrCode },
                    { key: "card", label: "Cartão", icon: CreditCard },
                  ] as const
                ).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPayMethod(key)}
                    aria-pressed={payMethod === key}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border py-3 text-body font-semibold transition-colors",
                      payMethod === key
                        ? "border-brand bg-brand text-brand-fg"
                        : "border-line-strong text-ink-soft active:bg-hover",
                    )}
                  >
                    <Icon className="size-[18px]" /> {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-small text-ink-muted">
                {payMethod === "pix"
                  ? "Pix: aprovação na hora, via QR Code ou copia e cola."
                  : "Cartão: crédito à vista ou parcelado, aprovação imediata."}
              </p>
            </div>
          )}

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

          {/* Order bump — adicionais em destaque, antes do pagamento (FR-CHK). */}
          {offers.some((o) => o.kind === "ORDER_BUMP") && (
            <div className={sectionClass}>
              <h2 className={sectionTitle}>Adicione ao seu pedido</h2>
              <div className="space-y-2">
                {offers
                  .filter((o) => o.kind === "ORDER_BUMP")
                  .map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      checked={!!selectedOffers[offer.id]}
                      onToggle={(next) =>
                        setSelectedOffers((prev) => ({ ...prev, [offer.id]: next }))
                      }
                    />
                  ))}
              </div>
            </div>
          )}

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
              {chosenOffers.map((offer) => (
                <li
                  key={offer.id}
                  className="flex items-center justify-between py-2 text-body"
                >
                  <span className="text-ink">
                    {offer.title}
                    <span className="text-ink-muted"> · adicional</span>
                  </span>
                  <span className="tabular-nums text-ink">{formatBRL(offer.priceCents)}</span>
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
            <details className="mt-3 border-t border-line pt-3 text-small text-ink-muted">
              <summary className="cursor-pointer font-medium text-ink-soft">
                Entenda os valores
              </summary>
              <ul className="mt-2 space-y-1.5">
                <li>
                  <strong className="text-ink">Subtotal</strong> — soma dos ingressos escolhidos.
                </li>
                {discountCents > 0 && (
                  <li>
                    <strong className="text-ink">Desconto</strong> — abatimento do cupom aplicado.
                  </li>
                )}
                {feeCents > 0 && (
                  <li>
                    <strong className="text-ink">Taxa de serviço</strong> — taxa da plataforma pela
                    emissão e pelo suporte dos seus ingressos.
                  </li>
                )}
                <li>
                  <strong className="text-ink">Total</strong> — valor final que você paga agora.
                </li>
              </ul>
            </details>
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
          <p className="text-center text-small text-ink-muted">
            Ao finalizar, você concorda com os termos do evento e a política de privacidade.
          </p>
        </>
      )}

      {/* Step 4 — Pagamento (dentro do próprio checkout) */}
      {step === 4 && access && (
        <OrderPayment
          access={access}
          mpPublicKey={mpPublicKey}
          initialMethod={payMethod}
          initialOrder={initialOrder}
          initialPix={initialPix}
          email={reuseActive ? undefined : email.trim().toLowerCase()}
          showTicketsLink
        />
      )}

      {/* Feedback enquanto o pedido + pagamento são preparados (passo 3 → 4). */}
      {submitting && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-page/90 px-6 text-center backdrop-blur"
          role="status"
          aria-live="polite"
        >
          <Spinner className="size-8 text-brand" />
          <p className="text-h3 font-semibold text-ink">{PREP_MESSAGES[prepMsg]}</p>
          <p className="text-body text-ink-muted">Não feche esta tela.</p>
        </div>
      )}

      {/* Barra de ação fixa no mobile (Total + avançar); estática no desktop. */}
      {step === 1 && (
        <ActionBar
          show
          totalCents={subtotalCents}
          totalLabel="Subtotal"
          note={totalQuantity === 0 ? "Selecione seus ingressos" : undefined}
          primaryLabel="Continuar"
          onPrimary={goToData}
          disabled={totalQuantity === 0}
        />
      )}
      {step === 2 && (
        <ActionBar
          show
          totalCents={subtotalCents}
          totalLabel="Subtotal"
          onBack={() => setStep(1)}
          primaryLabel="Continuar"
          onPrimary={goToReview}
          disabled={!dataStepValid}
        />
      )}
      {step === 3 && (
        <ActionBar
          show
          totalCents={totalCents}
          totalLabel="Total"
          onBack={() => setStep(2)}
          primaryLabel="Finalizar"
          onPrimary={submit}
          loading={submitting}
        />
      )}
    </section>
  );
}

/** Cartão de oferta (upsell / order bump) com checkbox — segue a cor do produtor. */
function OfferCard({
  offer,
  checked,
  onToggle,
}: {
  offer: PublicOfferView;
  checked: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!checked)}
      aria-pressed={checked}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        checked ? "border-brand bg-brand/5" : "border-line bg-surface hover:bg-hover",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          checked ? "border-brand bg-brand text-brand-fg" : "border-line-strong",
        )}
        aria-hidden
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-ink">{offer.title}</span>
        {offer.description && (
          <span className="mt-0.5 block text-small text-ink-muted">{offer.description}</span>
        )}
      </span>
      <span className="shrink-0 text-right">
        {offer.originalPriceCents !== null && (
          <span className="block text-small text-ink-muted line-through tabular-nums">
            {formatBRL(offer.originalPriceCents)}
          </span>
        )}
        <span className="block font-semibold tabular-nums text-brand">
          + {formatBRL(offer.priceCents)}
        </span>
      </span>
    </button>
  );
}

/** Stepper de círculos numerados (Ingressos → Dados → Revisão → Pagamento). */
function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-start" aria-label={`Passo ${current} de ${STEP_LABELS.length}`}>
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        const last = i === STEP_LABELS.length - 1;
        return (
          <li
            key={label}
            className="flex flex-1 flex-col items-center"
            aria-current={active ? "step" : undefined}
          >
            <div className="flex w-full items-center">
              <span className="h-0.5 flex-1" aria-hidden />
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-small font-bold tabular-nums transition-colors",
                  done || active
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-line-strong bg-surface text-ink-muted",
                )}
              >
                {done ? <Check className="size-4" /> : n}
              </span>
              <span
                className={cn("h-0.5 flex-1", last ? "opacity-0" : n < current ? "bg-brand" : "bg-hover")}
                aria-hidden
              />
            </div>
            <span
              className={cn(
                "mt-1.5 text-center text-caption leading-tight",
                active ? "font-semibold text-ink" : "text-ink-muted",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Barra de ação do checkout. No mobile é fixa no rodapé (com safe-area); no
 * desktop (sm+) volta a ser um elemento estático no fim da seção. É opaca e com
 * z alto para cobrir o CTA flutuante do passo 1 caso ambos coincidam.
 */
function ActionBar({
  show,
  totalCents,
  totalLabel,
  note,
  primaryLabel,
  onPrimary,
  onBack,
  disabled,
  loading,
}: {
  show: boolean;
  totalCents: number;
  totalLabel: string;
  /** When set, replaces the total block (e.g. "Selecione seus ingressos"). */
  note?: string | undefined;
  primaryLabel: string;
  onPrimary: () => void;
  onBack?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  if (!show) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 px-3 py-3 backdrop-blur sm:static sm:z-auto sm:rounded-xl sm:border sm:bg-surface sm:px-4 sm:backdrop-blur-none"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink-soft transition-colors active:bg-hover"
          >
            <ArrowLeft className="size-5" />
          </button>
        )}
        {note ? (
          <p className="min-w-0 flex-1 text-body font-medium text-ink-muted">{note}</p>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-caption text-ink-muted">{totalLabel}</p>
            <p className="text-h3 font-bold tabular-nums text-ink">{formatBRL(totalCents)}</p>
          </div>
        )}
        <Button
          size="lg"
          className="shrink-0"
          disabled={disabled ?? false}
          loading={loading ?? false}
          onClick={onPrimary}
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
