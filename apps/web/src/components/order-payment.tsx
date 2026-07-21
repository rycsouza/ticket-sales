"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, CreditCard, PartyPopper, QrCode } from "lucide-react";
import { Badge, Button, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ORDER_STATUS, statusMeta } from "@/lib/status";
import { CardBrick } from "@/components/card-brick";

/** Buyer credential: strong access token (no e-mail) or code + e-mail. */
export type OrderAccess = { token: string } | { code: string; email: string };

interface OrderView {
  code: string;
  status: string;
  totalCents: number;
  expiresAt: string | null;
}

interface PixView {
  pixQrCode: string | null;
  pixQrCodeText: string | null;
  expiresAt: string | null;
}

function formatBRL(centsValue: number): string {
  return (centsValue / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const POLL_INTERVAL_MS = 10_000;
const cardClass = "rounded-xl border border-line bg-surface p-4";

/**
 * Order payment + status view, shared by the checkout step 4 and the /pedido
 * page. Given an access credential it resolves the order, auto-generates the
 * Pix (Print 4), lets the buyer pay by Pix or card, polls until confirmed, and
 * renders the paid / expired states. All money/e-mail resolution is server-side.
 */
export function OrderPayment({
  access,
  mpPublicKey,
  email,
  showTicketsLink = false,
}: {
  access: OrderAccess;
  mpPublicKey: string | null;
  /** Only used to personalize the success message; never sent anywhere. */
  email?: string | undefined;
  /** Show a link to /pedido after payment (useful from the checkout flow). */
  showTicketsLink?: boolean;
}) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [pix, setPix] = useState<PixView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resent, setResent] = useState(false);
  const [payMethod, setPayMethod] = useState<"pix" | "card">("pix");
  const [cardProcessing, setCardProcessing] = useState(false);
  const credentials = useRef<OrderAccess>(access);
  // React StrictMode double-invokes effects in dev; a duplicated Pix request
  // races the PSP into a lock (423), so the auto-track must fire exactly once.
  const started = useRef(false);

  const lookup = useCallback(async (creds: OrderAccess) => {
    const response = await fetch("/api/public/orders/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    if (!response.ok) return null;
    return (await response.json()) as OrderView;
  }, []);

  const startPix = useCallback(async (creds: OrderAccess) => {
    const response = await fetch("/api/public/orders/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    const data = (await response.json()) as PixView & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Falha ao gerar o Pix.");
    return data;
  }, []);

  const track = useCallback(
    async (creds: OrderAccess) => {
      setError(null);
      const found = await lookup(creds);
      if (!found) {
        setError("Não foi possível carregar o pedido. Tente novamente em instantes.");
        return;
      }
      credentials.current = creds;
      setOrder(found);
      if (found.status === "AWAITING_PAYMENT" && !pix) {
        try {
          setPix(await startPix(creds));
        } catch (pixError) {
          setError(pixError instanceof Error ? pixError.message : "Falha ao gerar o Pix.");
        }
      }
    },
    [lookup, startPix, pix],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void track(access);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (order?.status !== "AWAITING_PAYMENT") return;
    const interval = setInterval(async () => {
      const found = await lookup(credentials.current);
      if (found && found.status !== "AWAITING_PAYMENT") setOrder(found);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [order?.status, lookup]);

  useEffect(() => {
    if (order?.status !== "AWAITING_PAYMENT" || !order.expiresAt) {
      setCountdown(null);
      return;
    }
    const target = new Date(order.expiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, target - Date.now());
      const minutes = Math.floor(remaining / 60_000);
      const seconds = Math.floor((remaining % 60_000) / 1000);
      setCountdown(`${minutes}:${String(seconds).padStart(2, "0")}`);
      if (remaining === 0) void track(credentials.current);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [order?.status, order?.expiresAt, track]);

  async function copyPixCode() {
    if (!pix?.pixQrCodeText) return;
    await navigator.clipboard.writeText(pix.pixQrCodeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function resendTickets() {
    setResent(false);
    const response = await fetch("/api/public/orders/resend-tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials.current),
    });
    if (response.ok) setResent(true);
    else setError("Não foi possível reenviar agora. Tente novamente em alguns minutos.");
  }

  const errorBox = error && (
    <p
      role="alert"
      className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-body text-danger-text"
    >
      {error}
    </p>
  );

  if (!order) {
    return (
      <div className={`${cardClass} text-center text-body text-ink-muted`}>
        Carregando seu pedido…
        {errorBox}
      </div>
    );
  }

  const status = statusMeta(ORDER_STATUS, order.status);

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-small text-ink-muted">Pedido</p>
            <p className="font-mono text-h3 font-bold text-ink">{order.code}</p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="mt-2 text-body text-ink-soft">
          Total: <strong className="tabular-nums">{formatBRL(order.totalCents)}</strong>
        </p>
      </div>

      {order.status === "AWAITING_PAYMENT" && (
        <div className={cardClass}>
          {countdown && (
            <p className="mb-3 text-center text-body text-ink-soft">
              Reserva expira em <span className="font-mono font-bold text-brand">{countdown}</span>
            </p>
          )}

          {mpPublicKey && (
            <div className="mb-4 grid grid-cols-2 gap-2">
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
                    "flex items-center justify-center gap-2 rounded-lg border py-2.5 text-body font-semibold transition-colors",
                    payMethod === key
                      ? "border-brand bg-brand text-brand-fg"
                      : "border-line-strong text-ink-soft active:bg-hover",
                  )}
                >
                  <Icon className="size-[18px]" /> {label}
                </button>
              ))}
            </div>
          )}

          {payMethod === "pix" ? (
            <div className="text-center">
              <h2 className="mb-3 text-h3 text-ink">Pague com Pix para garantir</h2>
              {pix?.pixQrCode && (
                <img
                  src={`data:image/png;base64,${pix.pixQrCode}`}
                  alt="QR Code Pix"
                  className="mx-auto size-56 rounded-lg border border-line"
                />
              )}
              {pix?.pixQrCodeText && (
                <Button
                  variant="outline"
                  className="mt-3 w-full"
                  leftIcon={
                    copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />
                  }
                  onClick={copyPixCode}
                >
                  {copied ? "Copiado" : "Copiar código Pix"}
                </Button>
              )}
              <p className="mt-3 text-small text-ink-muted">
                Aprovação automática — esta tela atualiza sozinha após o pagamento.
              </p>
            </div>
          ) : cardProcessing ? (
            <p className="py-6 text-center text-body text-ink-soft">
              Pagamento em análise. Assim que for aprovado, seus ingressos são enviados e esta tela
              atualiza sozinha.
            </p>
          ) : (
            mpPublicKey && (
              <CardBrick
                publicKey={mpPublicKey}
                amountCents={order.totalCents}
                getAccess={() => credentials.current}
                onApproved={() => void track(credentials.current)}
                onProcessing={() => setCardProcessing(true)}
                payerEmail={email}
              />
            )
          )}
        </div>
      )}

      {order.status === "PAID" && (
        <div className="rounded-xl border border-success-border bg-success-bg p-5 text-center">
          <PartyPopper className="mx-auto size-8 text-success" />
          <h2 className="mt-2 text-h3 text-success-text">Pagamento confirmado!</h2>
          <p className="mt-1 text-body text-success-text">
            Seus ingressos foram enviados{" "}
            {email ? <strong>para {email}</strong> : "para o seu e-mail"}. Cada ingresso tem um link
            próprio com QR Code.
          </p>
          {showTicketsLink && (
            <Link href="/pedido" className={buttonVariants({ size: "lg", className: "mt-4 w-full" })}>
              Ver meus pedidos
            </Link>
          )}
          <Button
            variant="outline"
            className="mt-3 w-full"
            leftIcon={resent ? <Check className="size-4 text-success" /> : undefined}
            onClick={resendTickets}
          >
            {resent ? "Reenviado — confira sua caixa de entrada" : "Reenviar ingressos por e-mail"}
          </Button>
          <p className="mt-2 text-small text-success-text/80">
            O reenvio gera novos links e invalida os anteriores.
          </p>
        </div>
      )}

      {order.status === "EXPIRED" && (
        <div className="rounded-xl border border-warning-border bg-warning-bg p-5 text-center text-warning-text">
          <h2 className="text-h3">Reserva expirada</h2>
          <p className="mt-1 text-body">
            O prazo de pagamento terminou e os ingressos voltaram para venda. Você pode fazer um novo
            pedido na página do evento.
          </p>
        </div>
      )}

      {errorBox}
    </div>
  );
}
