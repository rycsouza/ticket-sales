import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Consistent page header: optional breadcrumb, title, description, actions. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: ReactNode;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  breadcrumb?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumb && <div className="mb-2 text-small text-ink-muted">{breadcrumb}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-h1 text-ink">{title}</h1>
          {description && <p className="mt-1 text-body text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
