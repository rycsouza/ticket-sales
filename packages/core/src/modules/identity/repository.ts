import type { PrismaClient } from "@ingressos/db";
import type {
  InviteRecord,
  InviteStatus,
  MembershipRecord,
  MembershipRole,
  MembershipStatus,
  OrganizationRecord,
  UserRecord,
} from "./types";

// Repository interfaces are org-scoped by signature (AGENTS.md): any method
// touching organization-owned data REQUIRES organizationId. There is no
// "find by id alone" on purpose (IDOR/BOLA defense, CLAUDE_SECURITY_RULES §7).

export interface OrganizationRepository {
  /** Creates the organization and its OWNER membership atomically. */
  createWithOwner(
    data: {
      name: string;
      document?: string | undefined;
      email?: string | undefined;
      phone?: string | undefined;
    },
    ownerUserId: string,
  ): Promise<OrganizationRecord>;
  findById(organizationId: string): Promise<OrganizationRecord | null>;
  /** Organizations where the user holds an ACTIVE membership (FR-ORG-006). */
  listByUserId(
    userId: string,
  ): Promise<{ organization: OrganizationRecord; role: MembershipRole }[]>;
}

export interface MembershipRepository {
  findByOrgAndUser(organizationId: string, userId: string): Promise<MembershipRecord | null>;
  findByIdScoped(organizationId: string, membershipId: string): Promise<MembershipRecord | null>;
  listByOrganization(organizationId: string): Promise<MembershipRecord[]>;
  countActiveByRole(organizationId: string, role: MembershipRole): Promise<number>;
  create(data: {
    organizationId: string;
    userId: string;
    role: MembershipRole;
  }): Promise<MembershipRecord>;
  updateStatus(
    organizationId: string,
    membershipId: string,
    status: MembershipStatus,
  ): Promise<MembershipRecord>;
}

export interface InviteRepository {
  create(data: {
    organizationId: string;
    email: string;
    role: MembershipRole;
    tokenHash: string;
    expiresAt: Date;
    invitedByUserId: string;
  }): Promise<InviteRecord>;
  /** Token lookup is cross-org by nature (acceptance is pre-auth). */
  findByTokenHash(tokenHash: string): Promise<InviteRecord | null>;
  findByIdScoped(organizationId: string, inviteId: string): Promise<InviteRecord | null>;
  findPendingByOrgAndEmail(organizationId: string, email: string): Promise<InviteRecord | null>;
  updateStatus(
    inviteId: string,
    status: InviteStatus,
    fields?: { acceptedByUserId?: string; acceptedAt?: Date; revokedAt?: Date },
  ): Promise<InviteRecord>;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(userId: string): Promise<UserRecord | null>;
  create(data: { email: string; name: string; passwordHash: string }): Promise<UserRecord>;
  /** Store the pending (not-yet-enabled) TOTP secret during enrollment. */
  setMfaPendingSecret(userId: string, secretEnc: string): Promise<void>;
  /** Enable MFA once the first code is confirmed, storing backup code hashes. */
  enableMfa(userId: string, backupCodeHashes: string[]): Promise<void>;
  /** Consume one backup code (removes it) — returns false if not present. */
  consumeBackupCode(userId: string, codeHash: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Prisma implementations
// ---------------------------------------------------------------------------

const membershipSelect = {
  id: true,
  organizationId: true,
  userId: true,
  role: true,
  status: true,
} as const;

const inviteSelect = {
  id: true,
  organizationId: true,
  email: true,
  role: true,
  status: true,
  tokenHash: true,
  expiresAt: true,
  invitedByUserId: true,
} as const;

const organizationSelect = {
  id: true,
  status: true,
  name: true,
  document: true,
  email: true,
  phone: true,
} as const;

const userSelect = {
  id: true,
  email: true,
  name: true,
  status: true,
  passwordHash: true,
  mfaEnabled: true,
  mfaSecretEnc: true,
  mfaBackupCodes: true,
} as const;

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createWithOwner(
    data: {
      name: string;
      document?: string | undefined;
      email?: string | undefined;
      phone?: string | undefined;
    },
    ownerUserId: string,
  ): Promise<OrganizationRecord> {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: data.name,
          document: data.document ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
        },
        select: organizationSelect,
      });
      await tx.membership.create({
        data: { organizationId: org.id, userId: ownerUserId, role: "OWNER" },
      });
      return org;
    });
  }

  async findById(organizationId: string): Promise<OrganizationRecord | null> {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: organizationSelect,
    });
  }

  async listByUserId(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: "ACTIVE" },
      select: { role: true, organization: { select: organizationSelect } },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({ organization: m.organization, role: m.role }));
  }
}

/** FR-ORG-009 — public identity of the producer, shown on the sales page. */
export interface PublicOrganizationIdentity {
  publicName: string | null;
  logoUrl: string | null;
}

/**
 * Cross-org PUBLIC organization identity — mirrors PrismaPublicEventReader:
 * a deliberate 2-field allowlist for the public sales page (organizer block).
 * Everything else about the organization never leaves the server.
 */
export class PrismaPublicOrganizationReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findIdentityById(organizationId: string): Promise<PublicOrganizationIdentity | null> {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { publicName: true, logoUrl: true },
    });
  }
}

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByOrgAndUser(organizationId: string, userId: string) {
    return this.prisma.membership.findFirst({
      where: { organizationId, userId },
      select: membershipSelect,
    });
  }

  async findByIdScoped(organizationId: string, membershipId: string) {
    return this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId },
      select: membershipSelect,
    });
  }

  async listByOrganization(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId },
      select: membershipSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async countActiveByRole(organizationId: string, role: MembershipRole) {
    return this.prisma.membership.count({
      where: { organizationId, role, status: "ACTIVE" },
    });
  }

  async create(data: { organizationId: string; userId: string; role: MembershipRole }) {
    return this.prisma.membership.create({ data, select: membershipSelect });
  }

  async updateStatus(organizationId: string, membershipId: string, status: MembershipStatus) {
    // updateMany + re-read keeps the org scope inside the WHERE clause
    const result = await this.prisma.membership.updateMany({
      where: { id: membershipId, organizationId },
      data: { status },
    });
    if (result.count === 0) {
      throw new Error("Membership not found in organization scope");
    }
    const updated = await this.findByIdScoped(organizationId, membershipId);
    if (!updated) throw new Error("Membership vanished after update");
    return updated;
  }
}

export class PrismaInviteRepository implements InviteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    email: string;
    role: MembershipRole;
    tokenHash: string;
    expiresAt: Date;
    invitedByUserId: string;
  }) {
    return this.prisma.invite.create({ data, select: inviteSelect });
  }

  async findByTokenHash(tokenHash: string) {
    return this.prisma.invite.findUnique({ where: { tokenHash }, select: inviteSelect });
  }

  async findByIdScoped(organizationId: string, inviteId: string) {
    return this.prisma.invite.findFirst({
      where: { id: inviteId, organizationId },
      select: inviteSelect,
    });
  }

  async findPendingByOrgAndEmail(organizationId: string, email: string) {
    return this.prisma.invite.findFirst({
      where: { organizationId, email, status: "PENDING" },
      select: inviteSelect,
    });
  }

  async updateStatus(
    inviteId: string,
    status: InviteStatus,
    fields?: { acceptedByUserId?: string; acceptedAt?: Date; revokedAt?: Date },
  ) {
    return this.prisma.invite.update({
      where: { id: inviteId },
      data: {
        status,
        ...(fields?.acceptedByUserId !== undefined
          ? { acceptedByUserId: fields.acceptedByUserId }
          : {}),
        ...(fields?.acceptedAt !== undefined ? { acceptedAt: fields.acceptedAt } : {}),
        ...(fields?.revokedAt !== undefined ? { revokedAt: fields.revokedAt } : {}),
      },
      select: inviteSelect,
    });
  }
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email }, select: userSelect });
  }

  async findById(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  }

  async create(data: { email: string; name: string; passwordHash: string }) {
    return this.prisma.user.create({ data, select: userSelect });
  }

  async setMfaPendingSecret(userId: string, secretEnc: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEnc: secretEnc, mfaEnabled: false },
    });
  }

  async enableMfa(userId: string, backupCodeHashes: string[]) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaBackupCodes: backupCodeHashes },
    });
  }

  async consumeBackupCode(userId: string, codeHash: string): Promise<boolean> {
    // Atomic-ish: read, check membership, write the filtered set back.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaBackupCodes: true },
    });
    if (!user || !user.mfaBackupCodes.includes(codeHash)) return false;
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: user.mfaBackupCodes.filter((h) => h !== codeHash) },
    });
    return true;
  }
}
