import type { RequestContext } from "../../shared/context";
import {
  ConflictError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../shared/errors";
import { generateToken, hashToken } from "../../shared/tokens";
import type { ClockPort } from "../../ports/clock";
import type { PasswordHasherPort } from "../../ports/password-hasher";
import type { AuditRepository } from "../audit/repository";
import type {
  InviteRepository,
  MembershipRepository,
  OrganizationRepository,
  UserRepository,
} from "./repository";
import type { AcceptInviteInput, CreateOrganizationInput, InviteUserInput } from "./schemas";
import { MEMBER_MANAGER_ROLES, type MembershipRecord, type MembershipRole } from "./types";

const INVITE_TTL_DAYS = 7;

export interface IdentityServiceDeps {
  organizations: OrganizationRepository;
  memberships: MembershipRepository;
  invites: InviteRepository;
  users: UserRepository;
  audit: AuditRepository;
  clock: ClockPort;
  passwordHasher: PasswordHasherPort;
}

/**
 * EP-01 use cases. Authorization is enforced HERE (backend), never assumed
 * from the UI (CLAUDE_SECURITY_RULES §6). Every ctx comes from the session,
 * resolved at the boundary.
 */
export class IdentityService {
  constructor(private readonly deps: IdentityServiceDeps) {}

  /** FR-ORG-001/002 — creator becomes OWNER atomically. */
  async createOrganization(
    input: CreateOrganizationInput,
    actor: { userId: string; correlationId: string },
  ) {
    const org = await this.deps.organizations.createWithOwner(input, actor.userId);
    await this.deps.audit.append({
      organizationId: org.id,
      actorUserId: actor.userId,
      action: "organization.created",
      resourceType: "organization",
      resourceId: org.id,
      after: { name: org.name },
      correlationId: actor.correlationId,
    });
    return org;
  }

  /** FR-ORG-003/004 — returns the raw token ONCE (for the invite e-mail). */
  async inviteUser(ctx: RequestContext, input: InviteUserInput) {
    await this.requireMemberManager(ctx);

    const existingInvite = await this.deps.invites.findPendingByOrgAndEmail(
      ctx.organizationId,
      input.email,
    );
    if (existingInvite) {
      throw new ConflictError("A pending invite already exists for this e-mail");
    }

    const existingUser = await this.deps.users.findByEmail(input.email);
    if (existingUser) {
      const existingMembership = await this.deps.memberships.findByOrgAndUser(
        ctx.organizationId,
        existingUser.id,
      );
      if (existingMembership && existingMembership.status !== "REVOKED") {
        throw new ConflictError("User is already a member of this organization");
      }
    }

    const rawToken = generateToken();
    const expiresAt = new Date(
      this.deps.clock.now().getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const invite = await this.deps.invites.create({
      organizationId: ctx.organizationId,
      email: input.email,
      role: input.role as MembershipRole,
      tokenHash: hashToken(rawToken),
      expiresAt,
      invitedByUserId: ctx.userId,
    });

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "invite.created",
      resourceType: "invite",
      resourceId: invite.id,
      // e-mail is personal data but required context for this audit trail;
      // the raw token is NEVER audited.
      after: { email: input.email, role: input.role, expiresAt: expiresAt.toISOString() },
      correlationId: ctx.correlationId,
    });

    return { invite, rawToken };
  }

  /** FR-ORG-004 — revocation makes the token unusable. */
  async revokeInvite(ctx: RequestContext, inviteId: string) {
    await this.requireMemberManager(ctx);

    const invite = await this.deps.invites.findByIdScoped(ctx.organizationId, inviteId);
    if (!invite || invite.status !== "PENDING") {
      throw new NotFoundOrForbiddenError();
    }

    const updated = await this.deps.invites.updateStatus(invite.id, "REVOKED", {
      revokedAt: this.deps.clock.now(),
    });

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "invite.revoked",
      resourceType: "invite",
      resourceId: invite.id,
      correlationId: ctx.correlationId,
    });

    return updated;
  }

  /**
   * Pre-auth flow: the token IS the authorization. Single-use, expiring,
   * revocable (FR-ORG-004, EP-01 acceptance criteria).
   */
  async acceptInvite(input: AcceptInviteInput, meta: { correlationId: string }) {
    const invite = await this.deps.invites.findByTokenHash(hashToken(input.token));

    // Generic error for every invalid case — no oracle for token guessing.
    if (!invite || invite.status !== "PENDING") {
      throw new NotFoundOrForbiddenError("Invalid or expired invite");
    }
    if (invite.expiresAt.getTime() <= this.deps.clock.now().getTime()) {
      await this.deps.invites.updateStatus(invite.id, "EXPIRED");
      throw new NotFoundOrForbiddenError("Invalid or expired invite");
    }

    let user = await this.deps.users.findByEmail(invite.email);
    if (!user) {
      user = await this.deps.users.create({
        email: invite.email,
        name: input.name,
        passwordHash: await this.deps.passwordHasher.hash(input.password),
      });
    }

    const existingMembership = await this.deps.memberships.findByOrgAndUser(
      invite.organizationId,
      user.id,
    );
    if (existingMembership && existingMembership.status !== "REVOKED") {
      throw new ConflictError("User is already a member of this organization");
    }

    const membership = await this.deps.memberships.create({
      organizationId: invite.organizationId,
      userId: user.id,
      role: invite.role,
    });

    await this.deps.invites.updateStatus(invite.id, "ACCEPTED", {
      acceptedByUserId: user.id,
      acceptedAt: this.deps.clock.now(),
    });

    await this.deps.audit.append({
      organizationId: invite.organizationId,
      actorUserId: user.id,
      action: "invite.accepted",
      resourceType: "membership",
      resourceId: membership.id,
      after: { role: invite.role },
      correlationId: meta.correlationId,
    });

    return { user, membership };
  }

  async listMembers(ctx: RequestContext): Promise<MembershipRecord[]> {
    // Any active member can see the member list; management requires more.
    await this.requireActiveMembership(ctx);
    return this.deps.memberships.listByOrganization(ctx.organizationId);
  }

  /** FR-ORG-007 — suspend/reactivate/revoke without deleting history. */
  async changeMembershipStatus(
    ctx: RequestContext,
    membershipId: string,
    newStatus: "ACTIVE" | "SUSPENDED" | "REVOKED",
    justification: string,
  ) {
    await this.requireMemberManager(ctx);
    if (!justification || justification.trim().length < 5) {
      throw new ValidationFailedError("A justification is required");
    }

    const target = await this.deps.memberships.findByIdScoped(ctx.organizationId, membershipId);
    if (!target) throw new NotFoundOrForbiddenError();

    if (target.userId === ctx.userId) {
      throw new ConflictError("You cannot change your own membership status");
    }

    // Never leave an organization without an active OWNER.
    if (target.role === "OWNER" && target.status === "ACTIVE" && newStatus !== "ACTIVE") {
      const activeOwners = await this.deps.memberships.countActiveByRole(
        ctx.organizationId,
        "OWNER",
      );
      if (activeOwners <= 1) {
        throw new ConflictError("Cannot deactivate the last active owner");
      }
    }

    const before = target.status;
    const updated = await this.deps.memberships.updateStatus(
      ctx.organizationId,
      membershipId,
      newStatus,
    );

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: `membership.status_changed`,
      resourceType: "membership",
      resourceId: membershipId,
      justification,
      before: { status: before },
      after: { status: newStatus },
      correlationId: ctx.correlationId,
    });

    return updated;
  }

  // -------------------------------------------------------------------------

  private async requireActiveMembership(ctx: RequestContext): Promise<MembershipRecord> {
    const membership = await this.deps.memberships.findByOrgAndUser(
      ctx.organizationId,
      ctx.userId,
    );
    if (!membership || membership.status !== "ACTIVE") {
      throw new NotFoundOrForbiddenError();
    }
    return membership;
  }

  private async requireMemberManager(ctx: RequestContext): Promise<MembershipRecord> {
    const membership = await this.requireActiveMembership(ctx);
    if (!MEMBER_MANAGER_ROLES.includes(membership.role)) {
      throw new NotFoundOrForbiddenError();
    }
    return membership;
  }
}
