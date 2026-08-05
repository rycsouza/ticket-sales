import type { MembershipRole } from "../identity/types";

/** FR-ADM-002 — who can view the unified order timeline. */
export const SUPPORT_TIMELINE_ROLES: readonly MembershipRole[] = [
  "OWNER",
  "ADMIN",
  "SUPPORT",
  "FINANCE",
];

/** FR-ADM-009 — who can write internal notes. */
export const SUPPORT_NOTE_ROLES: readonly MembershipRole[] = ["OWNER", "ADMIN", "SUPPORT"];

/** Org-home dashboard: every panel-capable staff role may see the counters. */
export const DASHBOARD_ROLES: readonly MembershipRole[] = [
  "OWNER",
  "ADMIN",
  "SUPPORT",
  "FINANCE",
  "EVENT_MANAGER",
];

/** Revenue on the dashboard is financial data — finance-capable roles only. */
export const DASHBOARD_REVENUE_ROLES: readonly MembershipRole[] = ["OWNER", "ADMIN", "FINANCE"];

export interface OrderNoteRecord {
  id: string;
  organizationId: string;
  orderId: string;
  authorUserId: string;
  body: string;
  createdAt: Date;
}
