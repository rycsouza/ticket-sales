"use client";

import { useEffect, useState } from "react";
import { Ticket } from "lucide-react";

/**
 * CTA fixo de compra — mantém os ingressos "na primeira dobra" em qualquer
 * página: visível sempre que o bloco de ingressos está fora da tela; ao tocar,
 * rola suave até ele. Some quando o checkout entra no viewport (inclusive
 * durante os passos, que têm a própria barra fixa).
 */
export function TicketsCta({
  anchorId,
  fromPriceCents,
}: {
  anchorId: string;
  fromPriceCents: number;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const target = document.getElementById(anchorId);
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShow(!(entry?.isIntersecting ?? true)),
      // Considera "visível" quando ao menos 15% do bloco está na tela
      { threshold: 0.15 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [anchorId]);

  if (!show) return null;

  const price = (fromPriceCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 p-3 backdrop-blur">
      <div className="mx-auto max-w-lg">
        <button
          type="button"
          onClick={() =>
            document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-body font-semibold text-brand-fg transition-colors hover:bg-brand-hover active:bg-brand-active"
        >
          <Ticket className="size-5" />
          Comprar ingressos — a partir de {price}
        </button>
      </div>
    </div>
  );
}
