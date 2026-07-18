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

export interface OrderNoteRecord {
  id: string;
  organizationId: string;
  orderId: string;
  authorUserId: string;
  body: string;
  createdAt: Date;
}
