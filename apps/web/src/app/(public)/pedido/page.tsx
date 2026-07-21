import { Suspense } from "react";
import { OrderTracker } from "./order-tracker";

export const metadata = { title: "Meu pedido — Ingressos", robots: { index: false, follow: false } };

// Read the public key at request time, not at build: this page must never be
// prerendered (it depends on runtime env + client-side session), and reading
// the full validated env here would break the build when env is absent.
export const dynamic = "force-dynamic";

export default function OrderPage() {
  // Public (client-side) key for the card tokenization Brick — never a secret,
  // read raw so a missing value simply hides the card option (no validation).
  const mpPublicKey = process.env.MERCADOPAGO_PUBLIC_KEY || null;
  return (
    <div className="min-h-dvh px-3 py-5 sm:px-4 sm:py-8">
      <main className="mx-auto max-w-lg rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
        <h1 className="mb-6 text-h1 text-ink">Meu pedido</h1>
        <Suspense>
          <OrderTracker mpPublicKey={mpPublicKey} />
        </Suspense>
      </main>
    </div>
  );
}
