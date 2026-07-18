/**
 * Money is always an integer amount of BRL cents (BR-FIN-001).
 * Floating point is forbidden for monetary values across the codebase.
 */
export type Cents = number & { readonly __brand: "Cents" };

export class InvalidMoneyError extends Error {
  constructor(value: unknown) {
    super(`Invalid monetary value (must be a safe non-negative integer of cents): ${String(value)}`);
    this.name = "InvalidMoneyError";
  }
}

/** Build a Cents value, rejecting floats, negatives, NaN and unsafe integers. */
export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidMoneyError(value);
  }
  return value as Cents;
}

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function subtractCents(a: Cents, b: Cents): Cents {
  const result = a - b;
  if (result < 0) throw new InvalidMoneyError(result);
  return cents(result);
}

/**
 * Percentage math for fees/commissions, in basis points (1% = 100 bps) to keep
 * everything in integers. Rounding is half-up and must be used consistently:
 * commissions and platform fees always round with THIS function so ledger
 * entries are reproducible (NFR-REL-006).
 */
export function percentageOf(amount: Cents, basisPoints: number): Cents {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
    throw new InvalidMoneyError(basisPoints);
  }
  return cents(Math.round((amount * basisPoints) / 10_000));
}

/** Format for display (pt-BR). Never use the result for computation. */
export function formatBRL(amount: Cents): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount / 100);
}
