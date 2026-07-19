import { Suspense } from "react";
import { loadServerEnv } from "@ingressos/config";
import { OrderTracker } from "./order-tracker";

export const metadata = { title: "Meu pedido — Ingressos" };

export default function OrderPage() {
  // Public (client-side) key for the card tokenization Brick — never a secret.
  const mpPublicKey = loadServerEnv().MERCADOPAGO_PUBLIC_KEY ?? null;
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-16 pt-8">
      <h1 className="mb-6 text-h1 text-ink">Meu pedido</h1>
      <Suspense>
        <OrderTracker mpPublicKey={mpPublicKey} />
      </Suspense>
    </main>
  );
}
