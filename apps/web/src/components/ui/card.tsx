import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Surface with a 1px border (no shadow by default), 12px radius. */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode | undefined;
  action?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        // flex-wrap + min-w no título: em telas estreitas a ação desce para a
        // linha de baixo em vez de esmagar o título até quebrar palavra a palavra
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-4 sm:px-5",
        className,
      )}
    >
      <div className="min-w-[12rem] max-w-full flex-1">
        <h3 className="text-h3 text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-small text-ink-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-4 sm:p-5", className)}>{children}</div>;
}
