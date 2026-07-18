import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/cn";

/** Shared control styling so every text-like input matches (reuse in PhoneInput etc.). */
export const inputBaseClass =
  "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-body text-ink transition-colors " +
  "placeholder:text-ink-faint focus:border-brand focus:outline-none " +
  "disabled:bg-subtle disabled:text-ink-faint aria-[invalid=true]:border-danger";

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(inputBaseClass, className)} {...props} />;
}
