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

/** A first-class affiliate/promoter (org-scoped). Lightweight by default; may be
 * linked to a login account (membershipId) and always has a private report token. */
export interface PromoterRecord {
  id: string;
  organizationId: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  membershipId: string | null;
  active: boolean;
}

export interface PromoterAssignmentRecord {
  id: string;
  organizationId: string;
  eventId: string;
  promoterId: string;
  active: boolean;
}

export interface PromoterLinkRecord {
  id: string;
  organizationId: string;
  eventId: string;
  promoterId: string;
  code: string;
  active: boolean;
  clickCount: number;
}

export interface CouponRecord {
  id: string;
  organizationId: string;
  /** null = organization-wide default coupon (applies to any event). */
  eventId: string | null;
  code: string;
  type: CouponType;
  value: number;
  active: boolean;
  promoterId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  redemptions: number;
}

export interface CommissionRuleRecord {
  id: string;
  organizationId: string;
  /** null = organization-wide default rule (applies to any event). */
  eventId: string | null;
  promoterId: string | null;
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
  promoterId: string | null;
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
  promoterId: string;
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
