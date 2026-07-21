"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
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
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Show the toggle only when the collapsed text actually overflows the clamp.
  useEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 4);
  }, [text]);

  if (!text) return null;

  return (
    <section className="mb-6">
      {config.heading && (
        <h2 className="mb-2 text-small font-semibold uppercase tracking-wide text-ink-muted">
          {config.heading}
        </h2>
      )}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="relative">
          <div
            ref={ref}
            className={cn(
              "whitespace-pre-line text-body leading-relaxed text-ink-soft",
              !expanded && "line-clamp-6",
            )}
          >
            {text}
          </div>
          {/* Fade hint over the last line while collapsed. */}
          {overflows && !expanded && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent"
            />
          )}
        </div>
        {(overflows || expanded) && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-small font-semibold text-brand hover:underline"
          >
            {expanded ? "Ver menos" : "Ver mais"}
            <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
    </section>
  );
}
