import type { MembershipRole } from "../identity/types";

/** PRD §8.2 — buyer base access / export: owner + admin (gestor). */
export const CRM_ROLES: readonly MembershipRole[] = ["OWNER", "ADMIN"];

export interface CustomerRecord {
  id: string;
  organizationId: string;
  email: string;
  name: string | null;
  phone: string | null;
  document: string | null;
  optedOut: boolean;
  consentVersion: string | null;
  consentAt: Date | null;
  consentOrigin: string | null;
  lastPurchaseAt: Date | null;
  anonymizedAt: Date | null;
}

/** DEC-010 — inactivity window before a buyer's PII is anonymized. */
export const RETENTION_MONTHS = 24;

/**
 * Shorter window for LEADS (contacts with no purchase): anonymized 12 months
 * after consent capture, since they never generated a purchase relationship.
 */
export const LEAD_RETENTION_MONTHS = 12;

/** A customer enriched with purchase aggregates (from paid orders). */
export interface CustomerSegmentRow {
  email: string;
  name: string | null;
  phone: string | null;
  optedOut: boolean;
  orderCount: number;
  totalSpentCents: number;
  lastPurchaseAt: Date | null;
}

export interface SegmentResult {
  count: number;
  totalSpentCents: number;
  customers: CustomerSegmentRow[];
}
