import { Suspense } from "react";
import { OrderTracker } from "./order-tracker";

export const metadata = { title: "Meu pedido — Ingressos" };

export default function OrderPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-16 pt-8">
      <h1 className="mb-6 text-h1 text-ink">Meu pedido</h1>
      <Suspense>
        <OrderTracker />
      </Suspense>
    </main>
  );
}
