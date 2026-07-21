"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { OrderPayment, type OrderAccess } from "@/components/order-payment";

const cardClass = "rounded-xl border border-line bg-surface p-4";

/**
 * /pedido — buyer's order lookup. Resolves an access credential (from the
 * checkout hand-off in sessionStorage, or the manual code+e-mail form) and then
 * defers all payment/status rendering to the shared OrderPayment component.
 */
export function OrderTracker({ mpPublicKey }: { mpPublicKey: string | null }) {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<OrderAccess | null>(null);
  const [knownEmail, setKnownEmail] = useState<string | undefined>(undefined);

  useEffect(() => {
    const stored = sessionStorage.getItem("ingressos:last-order");
    if (!stored) return;
    try {
      const saved = JSON.parse(stored) as { code?: string; email?: string; token?: string };
      if (saved.code) setCode(saved.code);
      if (saved.token) {
        setAccess({ token: saved.token });
      } else if (saved.code && saved.email) {
        setEmail(saved.email);
        setKnownEmail(saved.email);
        setAccess({ code: saved.code, email: saved.email });
      }
    } catch {
      sessionStorage.removeItem("ingressos:last-order");
    }
  }, []);

  if (access) {
    return <OrderPayment access={access} mpPublicKey={mpPublicKey} email={knownEmail} />;
  }

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
          disabled={code.length < 8 || !email.includes("@")}
          onClick={() => {
            const normalized = email.trim().toLowerCase();
            setKnownEmail(normalized);
            setAccess({ code: code.trim(), email: normalized });
          }}
        >
          Buscar pedido
        </Button>
      </div>
    </div>
  );
}
