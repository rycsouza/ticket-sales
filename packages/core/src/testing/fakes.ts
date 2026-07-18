// In-memory fakes for unit tests. They intentionally reproduce the
// org-scoping behavior of the Prisma repositories so authorization tests
// (org A cannot touch org B) are meaningful.

import type { CachePort } from "../ports/cache";
import type { ClockPort } from "../ports/clock";
import type { PasswordHasherPort } from "../ports/password-hasher";
import type {
  AuditEntry,
  AuditReadRecord,
  AuditReader,
  AuditRepository,
} from "../modules/audit/repository";
import type {
  InviteRepository,
  MembershipRepository,
  OrganizationRepository,
  UserRepository,
} from "../modules/identity/repository";
import type {
  InviteRecord,
  InviteStatus,
  MembershipRecord,
  MembershipRole,
  MembershipStatus,
  OrganizationRecord,
  UserRecord,
} from "../modules/identity/types";
import type { SessionRecord, SessionRepository } from "../modules/auth/repository";

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString().padStart(6, "0")}`;
}

export class FakeClock implements ClockPort {
  constructor(private current: Date = new Date("2026-07-17T12:00:00Z")) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class FakePasswordHasher implements PasswordHasherPort {
  async hash(plaintext: string): Promise<string> {
    return `hashed:${plaintext}`;
  }

  async verify(hash: string, plaintext: string): Promise<boolean> {
    return hash === `hashed:${plaintext}`;
  }
}

export class FakeCache implements CachePort {
  private store = new Map<string, { value: string; expiresAt: number }>();
  private clock: ClockPort;

  constructor(clock: ClockPort) {
    this.clock = clock;
  }

  private alive(key: string) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.clock.now().getTime()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.alive(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: this.clock.now().getTime() + ttlSeconds * 1000 });
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.alive(key)) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const current = this.alive(key);
    const next = current ? Number(current.value) + 1 : 1;
    const expiresAt = current?.expiresAt ?? this.clock.now().getTime() + ttlSeconds * 1000;
    this.store.set(key, { value: String(next), expiresAt });
    return next;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export class InMemoryAuditRepository implements AuditRepository, AuditReader {
  readonly entries: AuditEntry[] = [];
  private seq = 0;
  private readSeq = new WeakMap<AuditEntry, number>();

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    this.readSeq.set(entry, this.seq++);
  }

  byAction(action: string): AuditEntry[] {
    return this.entries.filter((entry) => entry.action === action);
  }

  private toReadRecord(entry: AuditEntry): AuditReadRecord {
    return {
      id: `audit_${this.readSeq.get(entry) ?? 0}`,
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      actorType: entry.actorType ?? "user",
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      justification: entry.justification ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      createdAt: new Date(2026, 0, 1, 0, 0, this.readSeq.get(entry) ?? 0),
    };
  }

  async listByResource(organizationId: string, resourceType: string, resourceId: string) {
    return this.entries
      .filter(
        (e) =>
          e.organizationId === organizationId &&
          e.resourceType === resourceType &&
          e.resourceId === resourceId,
      )
      .map((e) => this.toReadRecord(e));
  }

  async listByResources(
    organizationId: string,
    refs: { resourceType: string; resourceId: string }[],
  ) {
    return this.entries
      .filter(
        (e) =>
          e.organizationId === organizationId &&
          refs.some((r) => r.resourceType === e.resourceType && r.resourceId === e.resourceId),
      )
      .map((e) => this.toReadRecord(e));
  }
}

export class InMemoryUserRepository implements UserRepository {
  readonly users: UserRecord[] = [];

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findById(userId: string): Promise<UserRecord | null> {
    return this.users.find((user) => user.id === userId) ?? null;
  }

  async create(data: { email: string; name: string; passwordHash: string }): Promise<UserRecord> {
    if (this.users.some((user) => user.email === data.email)) {
      throw new Error("unique constraint: email");
    }
    const user: UserRecord = {
      id: nextId("user"),
      email: data.email,
      name: data.name,
      status: "ACTIVE",
      passwordHash: data.passwordHash,
      mfaEnabled: false,
      mfaSecretEnc: null,
      mfaBackupCodes: [],
    };
    this.users.push(user);
    return user;
  }

  async setMfaPendingSecret(userId: string, secretEnc: string): Promise<void> {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      user.mfaSecretEnc = secretEnc;
      user.mfaEnabled = false;
    }
  }

  async enableMfa(userId: string, backupCodeHashes: string[]): Promise<void> {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      user.mfaEnabled = true;
      user.mfaBackupCodes = backupCodeHashes;
    }
  }

  async consumeBackupCode(userId: string, codeHash: string): Promise<boolean> {
    const user = this.users.find((u) => u.id === userId);
    if (!user || !user.mfaBackupCodes.includes(codeHash)) return false;
    user.mfaBackupCodes = user.mfaBackupCodes.filter((h) => h !== codeHash);
    return true;
  }
}

export class InMemoryTrustedDeviceRepository {
  readonly devices: { userId: string; tokenHash: string; expiresAt: Date }[] = [];

  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    label?: string | undefined;
  }): Promise<void> {
    this.devices.push({ userId: data.userId, tokenHash: data.tokenHash, expiresAt: data.expiresAt });
  }

  async isValid(userId: string, tokenHash: string, now: Date): Promise<boolean> {
    return this.devices.some(
      (d) => d.userId === userId && d.tokenHash === tokenHash && d.expiresAt.getTime() > now.getTime(),
    );
  }
}

export class InMemoryMembershipRepository implements MembershipRepository {
  readonly memberships: MembershipRecord[] = [];

  async findByOrgAndUser(organizationId: string, userId: string) {
    return (
      this.memberships.find(
        (m) => m.organizationId === organizationId && m.userId === userId,
      ) ?? null
    );
  }

  async findByIdScoped(organizationId: string, membershipId: string) {
    return (
      this.memberships.find(
        (m) => m.id === membershipId && m.organizationId === organizationId,
      ) ?? null
    );
  }

  async listByOrganization(organizationId: string) {
    return this.memberships.filter((m) => m.organizationId === organizationId);
  }

  async countActiveByRole(organizationId: string, role: MembershipRole) {
    return this.memberships.filter(
      (m) => m.organizationId === organizationId && m.role === role && m.status === "ACTIVE",
    ).length;
  }

  async create(data: { organizationId: string; userId: string; role: MembershipRole }) {
    const membership: MembershipRecord = {
      id: nextId("mem"),
      organizationId: data.organizationId,
      userId: data.userId,
      role: data.role,
      status: "ACTIVE",
    };
    this.memberships.push(membership);
    return membership;
  }

  async updateStatus(organizationId: string, membershipId: string, status: MembershipStatus) {
    const membership = await this.findByIdScoped(organizationId, membershipId);
    if (!membership) throw new Error("Membership not found in organization scope");
    membership.status = status;
    return membership;
  }
}

export class InMemoryOrganizationRepository implements OrganizationRepository {
  readonly organizations: OrganizationRecord[] = [];

  constructor(private readonly memberships: InMemoryMembershipRepository) {}

  async createWithOwner(
    data: {
      name: string;
      document?: string | undefined;
      email?: string | undefined;
      phone?: string | undefined;
    },
    ownerUserId: string,
  ): Promise<OrganizationRecord> {
    const org: OrganizationRecord = {
      id: nextId("org"),
      status: "ACTIVE",
      name: data.name,
      document: data.document ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
    };
    this.organizations.push(org);
    await this.memberships.create({
      organizationId: org.id,
      userId: ownerUserId,
      role: "OWNER",
    });
    return org;
  }

  async findById(organizationId: string): Promise<OrganizationRecord | null> {
    return this.organizations.find((org) => org.id === organizationId) ?? null;
  }

  async listByUserId(userId: string) {
    const active = this.memberships.memberships.filter(
      (m) => m.userId === userId && m.status === "ACTIVE",
    );
    return active.flatMap((m) => {
      const organization = this.organizations.find((org) => org.id === m.organizationId);
      return organization ? [{ organization, role: m.role }] : [];
    });
  }
}

export class InMemoryInviteRepository implements InviteRepository {
  readonly invites: InviteRecord[] = [];

  async create(data: {
    organizationId: string;
    email: string;
    role: MembershipRole;
    tokenHash: string;
    expiresAt: Date;
    invitedByUserId: string;
  }): Promise<InviteRecord> {
    const invite: InviteRecord = {
      id: nextId("inv"),
      organizationId: data.organizationId,
      email: data.email,
      role: data.role,
      status: "PENDING",
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      invitedByUserId: data.invitedByUserId,
    };
    this.invites.push(invite);
    return invite;
  }

  async findByTokenHash(tokenHash: string) {
    return this.invites.find((invite) => invite.tokenHash === tokenHash) ?? null;
  }

  async findByIdScoped(organizationId: string, inviteId: string) {
    return (
      this.invites.find(
        (invite) => invite.id === inviteId && invite.organizationId === organizationId,
      ) ?? null
    );
  }

  async findPendingByOrgAndEmail(organizationId: string, email: string) {
    return (
      this.invites.find(
        (invite) =>
          invite.organizationId === organizationId &&
          invite.email === email &&
          invite.status === "PENDING",
      ) ?? null
    );
  }

  async updateStatus(inviteId: string, status: InviteStatus) {
    const invite = this.invites.find((entry) => entry.id === inviteId);
    if (!invite) throw new Error("Invite not found");
    invite.status = status;
    return invite;
  }
}

export class InMemorySessionRepository implements SessionRepository {
  readonly sessions: SessionRecord[] = [];

  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip?: string | undefined;
    userAgent?: string | undefined;
  }): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: nextId("ses"),
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      revokedAt: null,
    };
    this.sessions.push(session);
    return session;
  }

  async findByTokenHash(tokenHash: string) {
    return this.sessions.find((session) => session.tokenHash === tokenHash) ?? null;
  }

  async touch(): Promise<void> {
    // lastUsedAt is not part of SessionRecord — no-op in the fake
  }

  async revoke(sessionId: string, revokedAt: Date): Promise<void> {
    const session = this.sessions.find((entry) => entry.id === sessionId);
    if (session && session.revokedAt === null) session.revokedAt = revokedAt;
  }

  async revokeAllForUser(userId: string, revokedAt: Date): Promise<number> {
    let count = 0;
    for (const session of this.sessions) {
      if (session.userId === userId && session.revokedAt === null) {
        session.revokedAt = revokedAt;
        count += 1;
      }
    }
    return count;
  }
}
