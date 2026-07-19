import { Music } from "lucide-react";

type LineupConfig = {
  heading?: string | undefined;
  items: { name: string; time?: string | undefined }[];
};

export function LineupBlock({ config }: { config: LineupConfig }) {
  if (config.items.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-small font-semibold uppercase tracking-wide text-ink-muted">
        {config.heading ?? "Atrações"}
      </h2>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {config.items.map((item, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <Music className="size-4 shrink-0 text-brand" />
              <span className="truncate text-body font-medium text-ink">{item.name}</span>
            </span>
            {item.time && (
              <span className="shrink-0 text-small font-medium text-ink-muted">{item.time}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
