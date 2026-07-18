import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/cn";
import { formatBRPhone, onlyDigits } from "@/lib/format";
import { inputBaseClass } from "./input";

interface PhoneInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Digits only (e.g. "67984299967"). */
  value: string;
  /** Receives digits only, capped at 11 (BR mobile). */
  onChange: (digits: string) => void;
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/** BR phone field: masks display as (XX) XXXXX-XXXX, emits digits only. */
export function PhoneInput({
  value,
  onChange,
  invalid,
  className,
  ref,
  ...props
}: PhoneInputProps) {
  return (
    <input
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={formatBRPhone(value)}
      onChange={(e) => onChange(onlyDigits(e.target.value).slice(0, 11))}
      aria-invalid={invalid || undefined}
      placeholder="(00) 00000-0000"
      className={cn(inputBaseClass, className)}
      {...props}
    />
  );
}
