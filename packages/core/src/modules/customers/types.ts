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
}

/** A customer enriched with purchase aggregates (from paid orders). */
export interface CustomerSegmentRow {
  email: string;
  name: string | null;
  phone: string | null;
  optedOut: boolean;
  orderCount: number;
  totalSpentCents: number;
}

export interface SegmentResult {
  count: number;
  totalSpentCents: number;
  customers: CustomerSegmentRow[];
}
