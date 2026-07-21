"use client";

import type { Ref } from "react";
import { cn } from "@/lib/cn";
import { inputBaseClass } from "./input";

/**
 * BRL currency field. State is integer cents (the money unit used across the
 * domain); the displayed text is masked as "1.234,56". Empty → null.
 */
export function MoneyInput({
  valueCents,
  onChangeCents,
  id,
  ref,
  disabled,
  placeholder = "0,00",
  ariaInvalid,
}: {
  valueCents: number | null;
  onChangeCents: (cents: number | null) => void;
  id?: string;
  ref?: Ref<HTMLInputElement>;
  disabled?: boolean;
  placeholder?: string;
  ariaInvalid?: boolean;
}) {
  const display =
    valueCents === null
      ? ""
      : (valueCents / 100).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-ink-muted"
        aria-hidden
      >
        R$
      </span>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChangeCents(digits === "" ? null : Number.parseInt(digits, 10));
        }}
        className={cn(inputBaseClass, "pl-9 text-right tabular-nums")}
      />
    </div>
  );
}
