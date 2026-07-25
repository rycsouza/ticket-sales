import { z } from "zod";

/**
 * Staff inputs — strict allowlists (CLAUDE_SECURITY_RULES §19). organizationId,
 * eventId, promoterId scope and status are NEVER taken from the body when they
 * come from the route/verified membership; only ids the caller legitimately
 * selects (which promoter, which membership to link) are accepted here.
 */

// Create a lightweight promoter (no login). contact* are optional.
export const createPromoterSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    contactEmail: z.string().trim().email().max(254).optional(),
    contactPhone: z
      .string()
      .trim()
      .regex(/^\d{8,20}$/, "phone must be 8-20 digits")
      .optional(),
  })
  .strict();
export type CreatePromoterInput = z.infer<typeof createPromoterSchema>;

// Promote a lightweight promoter to a login account (link a PROMOTER membership).
export const promoteToLoginSchema = z
  .object({
    membershipId: z.string().uuid(),
  })
  .strict();
export type PromoteToLoginInput = z.infer<typeof promoteToLoginSchema>;

// Link an existing promoter to an event.
export const linkPromoterSchema = z
  .object({
    promoterId: z.string().uuid(),
  })
  .strict();
export type LinkPromoterInput = z.infer<typeof linkPromoterSchema>;

export const createPromoterLinkSchema = z
  .object({
    promoterId: z.string().uuid(),
  })
  .strict();
export type CreatePromoterLinkInput = z.infer<typeof createPromoterLinkSchema>;

// Coupon code: uppercased alnum + dashes, human-shareable. Stored uppercased.
const couponCode = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[A-Za-z0-9-]+$/, "code must be letters, numbers or dashes");

export const createCouponSchema = z
  .object({
    code: couponCode,
    type: z.enum(["PERCENT", "FIXED"]),
    // PERCENT: basis points (1..10000). FIXED: cents (>= 1).
    value: z.number().int().min(1).max(10_000_000),
    promoterId: z.string().uuid().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    maxRedemptions: z.number().int().min(1).max(1_000_000).optional(),
  })
  .strict()
  .refine((v) => v.type !== "PERCENT" || v.value <= 10_000, {
    message: "PERCENT coupon value is in basis points (max 10000 = 100%)",
    path: ["value"],
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt.getTime() > v.startsAt.getTime(), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

// Public checkout coupon preview (FR-CHK-008) — only the code is accepted.
export const couponPreviewSchema = z
  .object({
    code: couponCode,
  })
  .strict();
export type CouponPreviewInput = z.infer<typeof couponPreviewSchema>;

export const createCommissionRuleSchema = z
  .object({
    promoterId: z.string().uuid().optional(),
    ticketTypeId: z.string().uuid().optional(),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.number().int().min(0).max(10_000_000),
    base: z.enum(["NOMINAL", "AFTER_DISCOUNT"]).optional(),
  })
  .strict()
  .refine((v) => v.type !== "PERCENT" || v.value <= 10_000, {
    message: "PERCENT rule value is in basis points (max 10000 = 100%)",
    path: ["value"],
  });
export type CreateCommissionRuleInput = z.infer<typeof createCommissionRuleSchema>;

// Register a promoter commission payout (FINANCE). eventId optional (null =
// across all events for that promoter).
export const promoterPayoutSchema = z
  .object({
    promoterId: z.string().uuid(),
    eventId: z.string().uuid().optional(),
    amountCents: z.number().int().min(1).max(1_000_000_000),
    memo: z.string().trim().max(280).optional(),
  })
  .strict();
export type PromoterPayoutInput = z.infer<typeof promoterPayoutSchema>;
