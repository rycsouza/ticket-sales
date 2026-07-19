import type { PublicEventView } from "@/lib/public-views";

type DescriptionConfig = {
  heading?: string | undefined;
  /** null = usa a descrição do evento; texto próprio substitui sem tocá-la. */
  text: string | null;
};

export function DescriptionBlock({
  event,
  config,
}: {
  event: PublicEventView;
  config: DescriptionConfig;
}) {
  const text = config.text ?? event.description;
  if (!text) return null;

  return (
    <section className="mb-6">
      {config.heading && (
        <h2 className="mb-2 text-small font-semibold uppercase tracking-wide text-ink-muted">
          {config.heading}
        </h2>
      )}
      <div className="whitespace-pre-line rounded-xl border border-line bg-surface p-4 text-body leading-relaxed text-ink-soft">
        {text}
      </div>
    </section>
  );
}
