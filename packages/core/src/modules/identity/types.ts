// Mirror of the Prisma enums — the domain layer owns these names so services
// and tests do not import Prisma types directly.

export const MEMBERSHIP_ROLES = [
  "OWNER",
  "ADMIN",
  "EVENT_MANAGER",
  "FINANCE",
  "SUPPORT",
  "GATE_COORDINATOR",
  "CHECKIN_OPERATOR",
  "PROMOTER",
] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export type MembershipStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";
export type InviteStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

/** Roles allowed to manage members and invites (PRD §8.2). */
export const MEMBER_MANAGER_ROLES: readonly MembershipRole[] = ["OWNER", "ADMIN"];

export interface OrganizationRecord {
  id: string;
  status: "ACTIVE" | "SUSPENDED";
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
}

export interface MembershipRecord {
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
}

export interface InviteRecord {
  id: string;
  organizationId: string;
  email: string;
  role: MembershipRole;
  status: InviteStatus;
  tokenHash: string;
  expiresAt: Date;
  invitedByUserId: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  passwordHash: string | null;
  mfaEnabled: boolean;
  mfaSecretEnc: string | null;
  mfaBackupCodes: string[];
}
