import type { MembershipRole } from "../identity/types";

export type CommissionType = "PERCENT" | "FIXED";
export type CommissionBase = "NOMINAL" | "AFTER_DISCOUNT";
export type CouponType = "PERCENT" | "FIXED";
export type AttributionMechanism = "NONE" | "LINK" | "COUPON";
export type CommissionEntryType = "ACCRUAL" | "REVERSAL";

/** PRD §8.2 — managing promoters/links/coupons/rules: owner + managers. */
export const PROMOTER_MANAGER_ROLES: readonly MembershipRole[] = [
  "OWNER",
  "ADMIN",
  "EVENT_MANAGER",
];

export interface PromoterAssignmentRecord {
  id: string;
  organizationId: string;
  eventId: string;
  membershipId: string;
  active: boolean;
}

export interface PromoterLinkRecord {
  id: string;
  organizationId: string;
  eventId: string;
  membershipId: string;
  code: string;
  active: boolean;
  clickCount: number;
}

export interface CouponRecord {
  id: string;
  organizationId: string;
  eventId: string;
  code: string;
  type: CouponType;
  value: number;
  active: boolean;
  membershipId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  redemptions: number;
}

export interface CommissionRuleRecord {
  id: string;
  organizationId: string;
  eventId: string;
  membershipId: string | null;
  ticketTypeId: string | null;
  type: CommissionType;
  value: number;
  base: CommissionBase;
  active: boolean;
}

export interface OrderAttributionRecord {
  id: string;
  organizationId: string;
  orderId: string;
  eventId: string;
  mechanism: AttributionMechanism;
  membershipId: string | null;
  couponId: string | null;
  linkId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
}

export interface CommissionEntryRecord {
  id: string;
  organizationId: string;
  eventId: string;
  membershipId: string;
  orderId: string;
  type: CommissionEntryType;
  quantity: number;
  baseCents: number;
  amountCents: number;
}

/** Snapshot of the rule applied to an accrual — keeps entries reproducible. */
export interface CommissionRuleSnapshot {
  ruleId: string;
  type: CommissionType;
  value: number;
  base: CommissionBase;
}
