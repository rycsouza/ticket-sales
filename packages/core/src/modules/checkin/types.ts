import type { MembershipRole } from "../identity/types";

export type CheckinMode = "ONLINE" | "OFFLINE";

/** FR-CIN-003/004 — who can validate/admit at the gate. */
export const CHECKIN_OPERATOR_ROLES: readonly MembershipRole[] = [
  "OWNER",
  "ADMIN",
  "GATE_COORDINATOR",
  "CHECKIN_OPERATOR",
];

/** FR-CIN-001/009/010 — coordinator actions (create/revoke, manual, undo). */
export const CHECKIN_COORDINATOR_ROLES: readonly MembershipRole[] = [
  "OWNER",
  "ADMIN",
  "GATE_COORDINATOR",
];

/** Roles that must be explicitly assigned to the event (non-superusers). */
export const CHECKIN_ASSIGNABLE_ROLES: readonly MembershipRole[] = [
  "GATE_COORDINATOR",
  "CHECKIN_OPERATOR",
];

export type CheckinRejectionReason =
  | "not_found"
  | "wrong_event"
  | "not_issued"
  | "blocked"
  | "cancelled"
  | "refunded"
  | "already_checked_in";

export interface CheckinAssignmentRecord {
  id: string;
  organizationId: string;
  eventId: string;
  membershipId: string;
  sectorId: string | null;
  active: boolean;
}

export interface CheckinRecord {
  id: string;
  organizationId: string;
  eventId: string;
  ticketId: string;
  operatorMembershipId: string;
  deviceId: string | null;
  mode: CheckinMode;
  manual: boolean;
  checkedInAt: Date;
}

export interface CheckinValidation {
  accepted: boolean;
  reason?: CheckinRejectionReason;
  ticket?: {
    id: string;
    ticketTypeId: string;
    participantName: string | null;
    status: string;
  };
  /** Present when rejected as already_checked_in. */
  existingCheckin?: {
    operatorMembershipId: string;
    checkedInAt: Date;
    deviceId: string | null;
  };
}

/** Per-item outcome of an offline sync (FR-CIN-014/017). */
export type SyncOutcome = "applied" | "duplicate" | "conflict" | "rejected";

export interface SyncItemResult {
  token: string;
  outcome: SyncOutcome;
  reason?: CheckinRejectionReason;
}

export interface CheckinDashboard {
  sold: number;
  present: number;
  absent: number;
  entryRatePercent: number;
}
