"use client";

import { useEffect, useState } from "react";

type CountdownConfig = {
  heading?: string | undefined;
};

function remaining(target: number) {
  const diff = target - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor(diff / 3_600_000) % 24,
    minutes: Math.floor(diff / 60_000) % 60,
    seconds: Math.floor(diff / 1000) % 60,
  };
}

/**
 * Conta até o início do evento; some sozinho depois que começa.
 * Renderiza vazio no SSR e hidrata no cliente (evita mismatch de relógio).
 */
export function CountdownBlock({
  startsAt,
  config,
}: {
  startsAt: string | null;
  config: CountdownConfig;
}) {
  const target = startsAt ? new Date(startsAt).getTime() : null;
  const [time, setTime] = useState<ReturnType<typeof remaining>>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!target) return;
    setMounted(true);
    setTime(remaining(target));
    const interval = setInterval(() => setTime(remaining(target)), 1000);
    return () => clearInterval(interval);
  }, [target]);

  if (!target || !mounted || !time) return null;

  const cells = [
    { value: time.days, label: "dias" },
    { value: time.hours, label: "horas" },
    { value: time.minutes, label: "min" },
    { value: time.seconds, label: "seg" },
  ];

  return (
    <section className="mb-6">
      {config.heading && (
        <h2 className="mb-2 text-small font-semibold uppercase tracking-wide text-ink-muted">
          {config.heading}
        </h2>
      )}
      <div className="grid grid-cols-4 gap-2">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="rounded-xl border border-brand-border bg-brand-soft py-3 text-center"
          >
            <p className="text-h2 font-bold tabular-nums text-brand">
              {String(cell.value).padStart(2, "0")}
            </p>
            <p className="text-caption uppercase tracking-wide text-ink-muted">{cell.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
