import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body text-ink transition-colors",
        "placeholder:text-ink-faint focus:border-brand focus:outline-none",
        "disabled:bg-subtle disabled:text-ink-faint aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}
