"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui";

/**
 * Buyer credential for the order endpoints: the strong access token (Print 4)
 * or the classic code+e-mail pair. Mirrors the type in order-tracker.
 */
type Access = { token: string } | { code: string; email: string };

interface Props {
  publicKey: string;
  amountCents: number;
  /** Resolves the current access credential at submit time. */
  getAccess: () => Access | null;
  /** Called when the card charge is approved (order is now paid). */
  onApproved: () => void;
  /** Called when the charge is accepted but still processing (async approval). */
  onProcessing: () => void;
  /**
   * Pre-fills the Brick's payer e-mail so its e-mail field is hidden — we
   * already know the buyer (the charge uses the order's e-mail server-side).
   * Absent (token/reuse path): a neutral placeholder still hides the field;
   * it is discarded — the backend authoritative e-mail is never the client's.
   */
  payerEmail?: string | undefined;
}

// Discarded server-side; only used to suppress the Brick's redundant e-mail field.
const PLACEHOLDER_EMAIL = "comprador@ingressos.app";

const SDK_SRC = "https://sdk.mercadopago.com/js/v2";

/** Card fields the Mercado Pago Card Payment Brick hands back on submit. */
interface BrickFormData {
  token: string;
  installments: number;
  payment_method_id: string;
  issuer_id?: string;
  payer?: { identification?: { type?: string; number?: string } };
}

// Minimal shape of the global injected by the MP SDK — we only touch what we use.
interface MpBricksController {
  unmount: () => void;
}
interface MpInstance {
  bricks: () => {
    create: (
      brick: "cardPayment",
      containerId: string,
      settings: unknown,
    ) => Promise<MpBricksController>;
  };
}
type MpConstructor = new (publicKey: string, options?: { locale?: string }) => MpInstance;

function loadSdk(): Promise<MpConstructor> {
  const w = window as unknown as { MercadoPago?: MpConstructor };
  if (w.MercadoPago) return Promise.resolve(w.MercadoPago);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    const onLoad = () => {
      if (w.MercadoPago) resolve(w.MercadoPago);
      else reject(new Error("SDK do Mercado Pago indisponível."));
    };
    if (existing) {
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar o SDK.")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("Falha ao carregar o SDK.")), {
      once: true,
    });
    document.body.appendChild(script);
  });
}

export function CardBrick({
  publicKey,
  amountCents,
  getAccess,
  onApproved,
  onProcessing,
  payerEmail,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MpBricksController | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function mountBrick() {
      try {
        const MercadoPago = await loadSdk();
        if (cancelled || !containerRef.current) return;
        containerRef.current.id = "cardPaymentBrick_container";
        const mp = new MercadoPago(publicKey, { locale: "pt-BR" });

        controllerRef.current = await mp.bricks().create(
          "cardPayment",
          "cardPaymentBrick_container",
          {
            initialization: {
              amount: amountCents / 100,
              // Providing the payer e-mail hides the Brick's e-mail field.
              payer: { email: payerEmail || PLACEHOLDER_EMAIL },
            },
            callbacks: {
              onReady: () => {
                if (!cancelled) setLoading(false);
              },
              onError: (brickError: { message?: string }) => {
                if (!cancelled) setError(brickError?.message ?? "Erro ao processar o cartão.");
              },
              onSubmit: (formData: BrickFormData) => submitCard(formData),
            },
          },
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Não foi possível iniciar o cartão.");
          setLoading(false);
        }
      }
    }

    async function submitCard(formData: BrickFormData): Promise<void> {
      setError(null);
      const access = getAccess();
      if (!access) {
        setError("Sessão do pedido expirada. Recarregue a página.");
        throw new Error("no access");
      }
      const identification = formData.payer?.identification;
      const body = {
        ...access,
        card: {
          cardToken: formData.token,
          installments: formData.installments,
          paymentMethodId: formData.payment_method_id,
          ...(formData.issuer_id ? { issuerId: formData.issuer_id } : {}),
          ...(identification?.type && identification?.number
            ? {
                payerIdentification: {
                  type: identification.type,
                  number: identification.number,
                },
              }
            : {}),
        },
      };

      const response = await fetch("/api/public/orders/pay-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Não foi possível concluir o pagamento.");
        throw new Error(data.error ?? "pay-card failed");
      }
      if (data.status === "APPROVED") {
        onApproved();
      } else if (data.status === "PROCESSING") {
        onProcessing();
      } else {
        setError("Pagamento recusado. Tente outro cartão ou use o Pix.");
        throw new Error("rejected");
      }
    }

    void mountBrick();
    return () => {
      cancelled = true;
      controllerRef.current?.unmount();
      controllerRef.current = null;
    };
    // Mount once for the given amount/key; the order does not change mid-page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-body text-ink-muted">
          <Spinner /> Carregando pagamento com cartão…
        </div>
      )}
      <div ref={containerRef} />
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-body text-danger-text"
        >
          {error}
        </p>
      )}
    </div>
  );
}
