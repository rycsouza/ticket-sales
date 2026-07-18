import { describe, expect, it } from "vitest";
import { computeCommission, resolveRuleForUnit } from "../commission";
import { couponDiscountCents, validateCoupon } from "../coupon";
import type { CommissionRuleRecord, CouponRecord } from "../types";

const PROMOTER = "mem_promoter";
const OTHER = "mem_other";
const TT_A = "tt_a";
const TT_B = "tt_b";

function rule(overrides: Partial<CommissionRuleRecord>): CommissionRuleRecord {
  return {
    id: overrides.id ?? "rule",
    organizationId: "org",
    eventId: "evt",
    membershipId: null,
    ticketTypeId: null,
    type: "PERCENT",
    value: 1000, // 10%
    base: "NOMINAL",
    active: true,
    ...overrides,
  };
}

describe("resolveRuleForUnit — specificity (FR-PRM-009)", () => {
  it("prefers membership+ticketType over less specific rules", () => {
    const rules = [
      rule({ id: "event-wide" }),
      rule({ id: "by-tt", ticketTypeId: TT_A }),
      rule({ id: "by-member", membershipId: PROMOTER }),
      rule({ id: "by-both", membershipId: PROMOTER, ticketTypeId: TT_A }),
    ];
    expect(resolveRuleForUnit(rules, PROMOTER, TT_A)?.id).toBe("by-both");
  });

  it("ignores rules scoped to another promoter or ticket type", () => {
    const rules = [
      rule({ id: "other-member", membershipId: OTHER }),
      rule({ id: "other-tt", ticketTypeId: TT_B }),
      rule({ id: "event-wide" }),
    ];
    expect(resolveRuleForUnit(rules, PROMOTER, TT_A)?.id).toBe("event-wide");
  });

  it("returns null when no active rule matches", () => {
    const rules = [rule({ id: "inactive", active: false })];
    expect(resolveRuleForUnit(rules, PROMOTER, TT_A)).toBeNull();
  });
});

describe("computeCommission", () => {
  const order = { subtotalCents: 20_000, discountCents: 0 };

  it("percentage of nominal price, per unit", () => {
    const units = [
      { ticketTypeId: TT_A, unitPriceCents: 10_000 },
      { ticketTypeId: TT_A, unitPriceCents: 10_000 },
    ];
    const result = computeCommission(units, [rule({ value: 1500 })], PROMOTER, order);
    expect(result.quantity).toBe(2);
    expect(result.baseCents).toBe(20_000);
    expect(result.amountCents).toBe(3_000); // 15% of 20000
  });

  it("fixed amount per eligible unit", () => {
    const units = [
      { ticketTypeId: TT_A, unitPriceCents: 10_000 },
      { ticketTypeId: TT_A, unitPriceCents: 10_000 },
    ];
    const result = computeCommission(
      units,
      [rule({ type: "FIXED", value: 500 })],
      PROMOTER,
      order,
    );
    expect(result.amountCents).toBe(1_000); // R$5 x 2
  });

  it("AFTER_DISCOUNT applies the unit's share of the order discount", () => {
    const units = [
      { ticketTypeId: TT_A, unitPriceCents: 10_000 },
      { ticketTypeId: TT_A, unitPriceCents: 10_000 },
    ];
    // 25% off the 20000 subtotal → each 10000 unit nets 7500; 10% commission
    const result = computeCommission(units, [rule({ base: "AFTER_DISCOUNT" })], PROMOTER, {
      subtotalCents: 20_000,
      discountCents: 5_000,
    });
    expect(result.baseCents).toBe(15_000);
    expect(result.amountCents).toBe(1_500);
  });

  it("units with no matching rule contribute zero", () => {
    const units = [
      { ticketTypeId: TT_A, unitPriceCents: 10_000 },
      { ticketTypeId: TT_B, unitPriceCents: 10_000 },
    ];
    // Rule only covers TT_A
    const result = computeCommission(
      units,
      [rule({ ticketTypeId: TT_A, value: 1000 })],
      PROMOTER,
      order,
    );
    expect(result.quantity).toBe(1);
    expect(result.amountCents).toBe(1_000);
  });
});

describe("coupon validation & discount (FR-CHK-008)", () => {
  const now = new Date("2026-07-18T12:00:00Z");
  function coupon(overrides: Partial<CouponRecord>): CouponRecord {
    return {
      id: "cpn",
      organizationId: "org",
      eventId: "evt",
      code: "SAVE",
      type: "PERCENT",
      value: 1000,
      active: true,
      membershipId: null,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      redemptions: 0,
      ...overrides,
    };
  }

  it("rejects missing / inactive / expired / exhausted coupons with reasons", () => {
    expect(validateCoupon(null, now).reason).toBe("not_found");
    expect(validateCoupon(coupon({ active: false }), now).reason).toBe("inactive");
    expect(
      validateCoupon(coupon({ endsAt: new Date("2026-07-01T00:00:00Z") }), now).reason,
    ).toBe("expired");
    expect(
      validateCoupon(coupon({ startsAt: new Date("2026-08-01T00:00:00Z") }), now).reason,
    ).toBe("not_started");
    expect(
      validateCoupon(coupon({ maxRedemptions: 5, redemptions: 5 }), now).reason,
    ).toBe("exhausted");
  });

  it("percentage and fixed discount, clamped to the subtotal", () => {
    expect(couponDiscountCents(coupon({ type: "PERCENT", value: 2000 }), 10_000)).toBe(2_000);
    expect(couponDiscountCents(coupon({ type: "FIXED", value: 3_000 }), 10_000)).toBe(3_000);
    // Never exceeds subtotal
    expect(couponDiscountCents(coupon({ type: "FIXED", value: 99_000 }), 10_000)).toBe(10_000);
  });
});
