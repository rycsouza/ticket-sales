import { describe, expect, it } from "vitest";
import {
  InvalidMoneyError,
  addCents,
  cents,
  formatBRL,
  percentageOf,
  subtractCents,
} from "../money";

describe("cents", () => {
  it("accepts safe non-negative integers", () => {
    expect(cents(0)).toBe(0);
    expect(cents(12_345)).toBe(12_345);
  });

  it.each([1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid value %s",
    (value) => {
      expect(() => cents(value)).toThrow(InvalidMoneyError);
    },
  );
});

describe("arithmetic", () => {
  it("adds and subtracts", () => {
    expect(addCents(cents(1000), cents(250))).toBe(1250);
    expect(subtractCents(cents(1000), cents(250))).toBe(750);
  });

  it("rejects negative results (compensating entries, not negative money)", () => {
    expect(() => subtractCents(cents(100), cents(200))).toThrow(InvalidMoneyError);
  });
});

describe("percentageOf (basis points)", () => {
  it("computes a 10% platform fee (1000 bps)", () => {
    expect(percentageOf(cents(10_000), 1000)).toBe(1000);
  });

  it("rounds half-up deterministically", () => {
    // 1.25% of R$ 1,00 = 1.25 cents -> 1 cent... Math.round(1.25) = 1
    expect(percentageOf(cents(100), 125)).toBe(1);
    // 1.5 cents rounds to 2
    expect(percentageOf(cents(100), 150)).toBe(2);
  });

  it("rejects invalid basis points", () => {
    expect(() => percentageOf(cents(100), -1)).toThrow(InvalidMoneyError);
    expect(() => percentageOf(cents(100), 10.5)).toThrow(InvalidMoneyError);
  });
});

describe("formatBRL", () => {
  it("formats for display in pt-BR", () => {
    //   = non-breaking space used by Intl
    expect(formatBRL(cents(123_456))).toBe("R$ 1.234,56");
  });
});
