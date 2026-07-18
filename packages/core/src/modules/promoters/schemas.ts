import { z } from "zod";

/**
 * Staff inputs — strict allowlists (CLAUDE_SECURITY_RULES §19). organizationId,
 * eventId and status are NEVER taken from the body; they come from the route
 * scope and the caller's verified membership.
 */

export const assignPromoterSchema = z
  .object({
    membershipId: z.string().uuid(),
  })
  .strict();
export type AssignPromoterInput = z.infer<typeof assignPromoterSchema>;

export const createPromoterLinkSchema = z
  .object({
    membershipId: z.string().uuid(),
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
    membershipId: z.string().uuid().optional(),
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

export const createCommissionRuleSchema = z
  .object({
    membershipId: z.string().uuid().optional(),
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
