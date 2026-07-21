import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AlertTone = "info" | "warning" | "success" | "danger" | "neutral";

const TONES: Record<AlertTone, string> = {
  info: "border-info-border bg-info-bg text-info-text",
  warning: "border-warning-border bg-warning-bg text-warning-text",
  success: "border-success-border bg-success-bg text-success-text",
  danger: "border-danger-border bg-danger-bg text-danger-text",
  neutral: "border-line bg-subtle text-ink-soft",
};

/**
 * Inline notice with icon + text (status is never conveyed by color alone).
 * `danger`/`warning` announce assertively; other tones are polite.
 */
export function Alert({
  tone = "info",
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  icon?: ReactNode | undefined;
  title?: ReactNode | undefined;
  children?: ReactNode | undefined;
  action?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 text-small",
        TONES[tone],
        className,
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-ink-soft")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
