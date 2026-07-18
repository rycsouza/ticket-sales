"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

  // Arriving from checkout: credentials in sessionStorage, never in the URL
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

  // Poll while awaiting payment (FR-CHK-015)
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

  // Reservation countdown (FR-CHK-011)
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

  // ------------------------------------------------------------------ views

  if (!order) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-600">
          Informe o código do pedido (enviado na confirmação) e o e-mail usado na compra.
        </p>
        <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Código do pedido</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().trim())}
              className="w-full rounded-lg border border-slate-200 px-3 py-3 font-mono text-base uppercase outline-none focus:border-brand-500"
              placeholder="EX.: ABCD2345EFGH"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">E-mail da compra</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-3 text-base outline-none focus:border-brand-500"
              placeholder="voce@exemplo.com"
            />
          </label>
          <button
            type="button"
            onClick={() => track({ code, email: email.trim().toLowerCase() })}
            disabled={loading || code.length < 8 || !email.includes("@")}
            className="w-full rounded-xl bg-brand-500 py-3.5 font-bold text-white active:bg-brand-600 disabled:opacity-50"
          >
            {loading ? "Buscando..." : "Buscar pedido"}
          </button>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-ink-400">Pedido</p>
            <p className="font-mono text-lg font-bold">{order.code}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>
        <p className="mt-2 text-sm text-ink-600">
          Total: <strong>{formatBRL(order.totalCents)}</strong>
        </p>
      </div>

      {order.status === "AWAITING_PAYMENT" && (
        <div className="rounded-xl bg-white p-4 text-center shadow-sm">
          <h2 className="mb-1 font-semibold">Pague com Pix para garantir</h2>
          {countdown && (
            <p className="mb-3 text-sm text-ink-600">
              Reserva expira em{" "}
              <span className="font-mono font-bold text-brand-600">{countdown}</span>
            </p>
          )}
          {pix?.pixQrCode && (
            <img
              src={`data:image/png;base64,${pix.pixQrCode}`}
              alt="QR Code Pix"
              className="mx-auto h-56 w-56 rounded-lg border border-slate-100"
            />
          )}
          {pix?.pixQrCodeText && (
            <button
              type="button"
              onClick={copyPixCode}
              className="mt-3 w-full rounded-xl border-2 border-brand-500 py-3 font-semibold text-brand-600 active:bg-brand-50"
            >
              {copied ? "Copiado ✓" : "Copiar código Pix"}
            </button>
          )}
          <p className="mt-3 text-xs text-ink-400">
            Aprovação automática — esta página atualiza sozinha após o pagamento.
          </p>
        </div>
      )}

      {order.status === "PAID" && (
        <div className="rounded-xl bg-emerald-50 p-5 text-center shadow-sm">
          <p className="text-3xl">🎉</p>
          <h2 className="mt-1 text-lg font-bold text-emerald-800">Pagamento confirmado!</h2>
          <p className="mt-1 text-sm text-emerald-700">
            Seus ingressos foram enviados para <strong>{email}</strong>. Cada ingresso tem um
            link próprio com QR Code.
          </p>
          <button
            type="button"
            onClick={resendTickets}
            className="mt-4 w-full rounded-xl border-2 border-emerald-600 py-3 font-semibold text-emerald-700 active:bg-emerald-100"
          >
            {resent ? "Reenviado ✓ Confira sua caixa de entrada" : "Reenviar ingressos por e-mail"}
          </button>
          <p className="mt-2 text-xs text-emerald-700/70">
            O reenvio gera novos links e invalida os anteriores.
          </p>
        </div>
      )}

      {order.status === "EXPIRED" && (
        <div className="rounded-xl bg-amber-50 p-5 text-center text-amber-800 shadow-sm">
          <h2 className="font-bold">Reserva expirada</h2>
          <p className="mt-1 text-sm">
            O prazo de pagamento terminou e os ingressos voltaram para venda. Você pode fazer um
            novo pedido na página do evento.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { label: string; className: string }> = {
    AWAITING_PAYMENT: { label: "Aguardando pagamento", className: "bg-amber-100 text-amber-800" },
    PAID: { label: "Pago", className: "bg-emerald-100 text-emerald-800" },
    EXPIRED: { label: "Expirado", className: "bg-slate-100 text-slate-600" },
    CANCELLED: { label: "Cancelado", className: "bg-slate-100 text-slate-600" },
    REFUNDED: { label: "Reembolsado", className: "bg-slate-100 text-slate-600" },
  };
  const style = styles[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${style.className}`}>
      {style.label}
    </span>
  );
}
