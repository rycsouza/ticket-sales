"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, PartyPopper } from "lucide-react";
import { Badge, Button, Field, Input } from "@/components/ui";
import { ORDER_STATUS, statusMeta } from "@/lib/status";

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

export function OrderTracker() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<OrderView | null>(null);
  const [pix, setPix] = useState<PixView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resent, setResent] = useState(false);
  const credentials = useRef<{ code: string; email: string } | null>(null);

  const lookup = useCallback(async (creds: { code: string; email: string }) => {
    const response = await fetch("/api/public/orders/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    if (!response.ok) return null;
    return (await response.json()) as OrderView;
  }, []);

  const startPix = useCallback(async (creds: { code: string; email: string }) => {
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
    async (creds: { code: string; email: string }) => {
      setLoading(true);
      setError(null);
      try {
        const found = await lookup(creds);
        if (!found) {
          setError("Pedido não encontrado. Confira o código e o e-mail da compra.");
          return;
        }
        credentials.current = creds;
        setOrder(found);
        if (found.status === "AWAITING_PAYMENT") {
          try {
            setPix(await startPix(creds));
          } catch (pixError) {
            setError(pixError instanceof Error ? pixError.message : "Falha ao gerar o Pix.");
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [lookup, startPix],
  );

  useEffect(() => {
    const stored = sessionStorage.getItem("ingressos:last-order");
    if (!stored) return;
    try {
      const creds = JSON.parse(stored) as { code: string; email: string };
      setCode(creds.code);
      setEmail(creds.email);
      void track(creds);
    } catch {
      sessionStorage.removeItem("ingressos:last-order");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (order?.status !== "AWAITING_PAYMENT" || !credentials.current) return;
    const interval = setInterval(async () => {
      const creds = credentials.current;
      if (!creds) return;
      const found = await lookup(creds);
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
      if (remaining === 0 && credentials.current) void track(credentials.current);
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
    if (!credentials.current) return;
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
      <div className="space-y-4">
        <p className="text-body text-ink-soft">
          Informe o código do pedido (enviado na confirmação) e o e-mail usado na compra.
        </p>
        <div className={`space-y-3 ${cardClass}`}>
          <Field label="Código do pedido" htmlFor="ot-code">
            <Input
              id="ot-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().trim())}
              className="font-mono uppercase"
              placeholder="EX.: ABCD2345EFGH"
            />
          </Field>
          <Field label="E-mail da compra" htmlFor="ot-email">
            <Input
              id="ot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@exemplo.com"
            />
          </Field>
          <Button
            size="lg"
            className="w-full"
            loading={loading}
            disabled={code.length < 8 || !email.includes("@")}
            onClick={() => track({ code, email: email.trim().toLowerCase() })}
          >
            Buscar pedido
          </Button>
        </div>
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
            <p className="font-mono text-h2 font-bold text-ink">{order.code}</p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="mt-2 text-body text-ink-soft">
          Total: <strong className="tabular-nums">{formatBRL(order.totalCents)}</strong>
        </p>
      </div>

      {order.status === "AWAITING_PAYMENT" && (
        <div className={`${cardClass} text-center`}>
          <h2 className="mb-1 text-h3 text-ink">Pague com Pix para garantir</h2>
          {countdown && (
            <p className="mb-3 text-body text-ink-soft">
              Reserva expira em{" "}
              <span className="font-mono font-bold text-brand">{countdown}</span>
            </p>
          )}
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
            Aprovação automática — esta página atualiza sozinha após o pagamento.
          </p>
        </div>
      )}

      {order.status === "PAID" && (
        <div className="rounded-xl border border-success-border bg-success-bg p-5 text-center">
          <PartyPopper className="mx-auto size-8 text-success" />
          <h2 className="mt-2 text-h3 text-success-text">Pagamento confirmado!</h2>
          <p className="mt-1 text-body text-success-text">
            Seus ingressos foram enviados para <strong>{email}</strong>. Cada ingresso tem um link
            próprio com QR Code.
          </p>
          <Button
            variant="outline"
            className="mt-4 w-full"
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
