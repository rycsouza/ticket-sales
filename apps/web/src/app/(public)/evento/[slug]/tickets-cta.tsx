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
    <div
      className="fixed inset-x-0 bottom-0 z-40 px-3 pt-2"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur">
        <div className="min-w-0 pl-1">
          <p className="text-caption text-ink-muted">A partir de</p>
          <p className="text-h3 font-bold tabular-nums text-ink">{price}</p>
        </div>
        <button
          type="button"
          onClick={() =>
            document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          className="flex shrink-0 items-center gap-2 rounded-xl bg-brand px-5 py-3 text-body font-semibold text-brand-fg transition-colors hover:bg-brand-hover active:bg-brand-active"
        >
          <Ticket className="size-5" />
          Comprar ingressos
        </button>
      </div>
    </div>
  );
}
