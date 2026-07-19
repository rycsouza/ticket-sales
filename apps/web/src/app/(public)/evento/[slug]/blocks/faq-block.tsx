import { ChevronDown } from "lucide-react";

type FaqConfig = {
  heading?: string | undefined;
  items: { question: string; answer: string }[];
};

/** Acordeão nativo (<details>) — zero JS, acessível por padrão. */
export function FaqBlock({ config }: { config: FaqConfig }) {
  if (config.items.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-small font-semibold uppercase tracking-wide text-ink-muted">
        {config.heading ?? "Perguntas frequentes"}
      </h2>
      <div className="divide-y divide-line rounded-xl border border-line bg-surface">
        {config.items.map((item, i) => (
          <details key={i} className="group px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-body font-medium text-ink [&::-webkit-details-marker]:hidden">
              {item.question}
              <ChevronDown className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2 whitespace-pre-line text-body leading-relaxed text-ink-soft">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
