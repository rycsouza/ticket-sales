import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** KPI tile: label, primary value (tabular), optional hint + icon. */
export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode | undefined;
  icon?: ReactNode | undefined;
  tone?: "neutral" | "success" | "danger" | undefined;
  className?: string | undefined;
}) {
  const valueTone =
    tone === "success"
      ? "text-success-text"
      : tone === "danger"
        ? "text-danger-text"
        : "text-ink";
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-small font-medium text-ink-muted">{label}</p>
        {icon && <span className="text-ink-faint">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-h1 tabular-nums", valueTone)}>{value}</p>
      {hint && <p className="mt-1 text-small text-ink-muted">{hint}</p>}
    </div>
  );
}
