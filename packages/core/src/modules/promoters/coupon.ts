import { cents, percentageOf } from "../../shared/money";
import type { CouponRecord } from "./types";

export type CouponRejection =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "exhausted";

export interface CouponValidity {
  ok: boolean;
  reason?: CouponRejection;
}

/**
 * Validates a coupon against event, window and redemption limit (FR-CHK-008).
 * Pure: callers load the coupon (already event-scoped) and pass `now`.
 */
export function validateCoupon(coupon: CouponRecord | null, now: Date): CouponValidity {
  if (!coupon) return { ok: false, reason: "not_found" };
  if (!coupon.active) return { ok: false, reason: "inactive" };
  if (coupon.startsAt && now.getTime() < coupon.startsAt.getTime()) {
    return { ok: false, reason: "not_started" };
  }
  if (coupon.endsAt && now.getTime() > coupon.endsAt.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions) {
    return { ok: false, reason: "exhausted" };
  }
  return { ok: true };
}

/**
 * Discount in cents for a valid coupon, clamped to [0, subtotal]. PERCENT is
 * basis points; FIXED is a whole-order cents amount. Half-up rounding via
 * percentageOf. Never returns more than the subtotal.
 */
export function couponDiscountCents(coupon: CouponRecord, subtotalCents: number): number {
  const subtotal = cents(subtotalCents);
  const raw =
    coupon.type === "PERCENT"
      ? percentageOf(subtotal, Math.min(coupon.value, 10_000))
      : coupon.value;
  return Math.max(0, Math.min(raw, subtotalCents));
}
