import { describe, expect, it } from "vitest";
import type { RequestContext } from "../../../shared/context";
import {
  ConflictError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../../shared/errors";
import {
  FakeClock,
  FakePasswordHasher,
  InMemoryAuditRepository,
  InMemoryInviteRepository,
  InMemoryMembershipRepository,
  InMemoryOrganizationRepository,
  InMemoryUserRepository,
} from "../../../testing/fakes";
import { IdentityService } from "../service";

const DAY_MS = 24 * 60 * 60 * 1000;

function setup() {
  const clock = new FakeClock();
  const audit = new InMemoryAuditRepository();
  const memberships = new InMemoryMembershipRepository();
  const organizations = new InMemoryOrganizationRepository(memberships);
  const invites = new InMemoryInviteRepository();
  const users = new InMemoryUserRepository();
  const service = new IdentityService({
    organizations,
    memberships,
    invites,
    users,
    audit,
    clock,
    passwordHasher: new FakePasswordHasher(),
  });
  return { clock, audit, memberships, organizations, invites, users, service };
}

function ctxFor(organizationId: string, userId: string, role = "OWNER"): RequestContext {
  return { organizationId, userId, role, correlationId: "corr-test" };
}

describe("createOrganization", () => {
  it("creates the organization with an OWNER membership and audits it", async () => {
    const { service, memberships, audit, users } = setup();
    const owner = await users.create({ email: "a@a.com", name: "Ana", passwordHash: "x" });

    const org = await service.createOrganization(
      { name: "Produtora Alfa" },
      { userId: owner.id, correlationId: "corr-1" },
    );

    const membership = await memberships.findByOrgAndUser(org.id, owner.id);
    expect(membership?.role).toBe("OWNER");
    expect(membership?.status).toBe("ACTIVE");
    expect(audit.byAction("organization.created")).toHaveLength(1);
  });
});

describe("inviteUser", () => {
  async function withOrg() {
    const env = setup();
    const owner = await env.users.create({ email: "o@o.com", name: "Owner", passwordHash: "x" });
    const org = await env.service.createOrganization(
      { name: "Org" },
      { userId: owner.id, correlationId: "c" },
    );
    return { ...env, owner, org };
  }

  it("allows OWNER to invite and returns a raw token once", async () => {
    const { service, owner, org, audit } = await withOrg();

    const { invite, rawToken } = await service.inviteUser(ctxFor(org.id, owner.id), {
      email: "novo@ex.com",
      role: "EVENT_MANAGER",
    });

    expect(rawToken).toHaveLength(43); // 32 bytes base64url
    expect(invite.tokenHash).not.toContain(rawToken);
    expect(audit.byAction("invite.created")).toHaveLength(1);
  });

  it("blocks roles without member management permission", async () => {
    const { service, org, users, memberships } = await withOrg();
    const manager = await users.create({ email: "m@m.com", name: "Man", passwordHash: "x" });
    await memberships.create({ organizationId: org.id, userId: manager.id, role: "EVENT_MANAGER" });

    await expect(
      service.inviteUser(ctxFor(org.id, manager.id, "EVENT_MANAGER"), {
        email: "x@x.com",
        role: "SUPPORT",
      }),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });

  it("blocks a user who is not a member of the target organization", async () => {
    const { service, org, users } = await withOrg();
    const outsider = await users.create({ email: "out@x.com", name: "Out", passwordHash: "x" });

    await expect(
      service.inviteUser(ctxFor(org.id, outsider.id), { email: "x@x.com", role: "SUPPORT" }),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });

  it("rejects a duplicate pending invite for the same e-mail", async () => {
    const { service, owner, org } = await withOrg();
    const input = { email: "dup@x.com", role: "SUPPORT" } as const;

    await service.inviteUser(ctxFor(org.id, owner.id), input);
    await expect(service.inviteUser(ctxFor(org.id, owner.id), input)).rejects.toThrow(
      ConflictError,
    );
  });

  it("rejects inviting an existing active member", async () => {
    const { service, owner, org, users, memberships } = await withOrg();
    const member = await users.create({ email: "mem@x.com", name: "Mem", passwordHash: "x" });
    await memberships.create({ organizationId: org.id, userId: member.id, role: "SUPPORT" });

    await expect(
      service.inviteUser(ctxFor(org.id, owner.id), { email: "mem@x.com", role: "SUPPORT" }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("acceptInvite", () => {
  async function withInvite() {
    const env = setup();
    const owner = await env.users.create({ email: "o@o.com", name: "Owner", passwordHash: "x" });
    const org = await env.service.createOrganization(
      { name: "Org" },
      { userId: owner.id, correlationId: "c" },
    );
    const { rawToken, invite } = await env.service.inviteUser(ctxFor(org.id, owner.id), {
      email: "guest@x.com",
      role: "FINANCE",
    });
    return { ...env, owner, org, rawToken, invite };
  }

  it("creates user and membership from a valid token", async () => {
    const { service, org, rawToken, memberships, audit } = await withInvite();

    const { user, membership } = await service.acceptInvite(
      { token: rawToken, name: "Convidada", password: "senha-muito-forte" },
      { correlationId: "c2" },
    );

    expect(user.email).toBe("guest@x.com");
    expect(membership.organizationId).toBe(org.id);
    expect(membership.role).toBe("FINANCE");
    expect(await memberships.findByOrgAndUser(org.id, user.id)).not.toBeNull();
    expect(audit.byAction("invite.accepted")).toHaveLength(1);
  });

  it("is single-use", async () => {
    const { service, rawToken } = await withInvite();
    const input = { token: rawToken, name: "Convidada", password: "senha-muito-forte" };

    await service.acceptInvite(input, { correlationId: "c" });
    await expect(service.acceptInvite(input, { correlationId: "c" })).rejects.toThrow(
      NotFoundOrForbiddenError,
    );
  });

  it("rejects expired tokens", async () => {
    const { service, rawToken, clock } = await withInvite();
    clock.advance(8 * DAY_MS);

    await expect(
      service.acceptInvite(
        { token: rawToken, name: "X", password: "senha-muito-forte" },
        { correlationId: "c" },
      ),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });

  it("rejects revoked tokens", async () => {
    const { service, rawToken, invite, org, owner } = await withInvite();
    await service.revokeInvite(ctxFor(org.id, owner.id), invite.id);

    await expect(
      service.acceptInvite(
        { token: rawToken, name: "X", password: "senha-muito-forte" },
        { correlationId: "c" },
      ),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });

  it("rejects garbage tokens with the same generic error", async () => {
    const { service } = await withInvite();
    await expect(
      service.acceptInvite(
        { token: "definitely-not-a-real-token-value", name: "X", password: "senha-muito-forte" },
        { correlationId: "c" },
      ),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });
});

describe("revokeInvite — tenant isolation", () => {
  it("org B admin cannot revoke an invite that belongs to org A", async () => {
    const env = setup();
    const ownerA = await env.users.create({ email: "a@a.com", name: "A", passwordHash: "x" });
    const orgA = await env.service.createOrganization(
      { name: "Org A" },
      { userId: ownerA.id, correlationId: "c" },
    );
    const { invite } = await env.service.inviteUser(ctxFor(orgA.id, ownerA.id), {
      email: "g@g.com",
      role: "SUPPORT",
    });

    const ownerB = await env.users.create({ email: "b@b.com", name: "B", passwordHash: "x" });
    const orgB = await env.service.createOrganization(
      { name: "Org B" },
      { userId: ownerB.id, correlationId: "c" },
    );

    // ctx is org B — the invite id exists, but in org A's scope
    await expect(env.service.revokeInvite(ctxFor(orgB.id, ownerB.id), invite.id)).rejects.toThrow(
      NotFoundOrForbiddenError,
    );
  });
});

describe("changeMembershipStatus", () => {
  async function withMembers() {
    const env = setup();
    const owner = await env.users.create({ email: "o@o.com", name: "Owner", passwordHash: "x" });
    const org = await env.service.createOrganization(
      { name: "Org" },
      { userId: owner.id, correlationId: "c" },
    );
    const member = await env.users.create({ email: "m@m.com", name: "Mem", passwordHash: "x" });
    const membership = await env.memberships.create({
      organizationId: org.id,
      userId: member.id,
      role: "SUPPORT",
    });
    return { ...env, owner, org, member, membership };
  }

  it("suspends a member with justification and audits before/after", async () => {
    const { service, owner, org, membership, audit } = await withMembers();

    const updated = await service.changeMembershipStatus(
      ctxFor(org.id, owner.id),
      membership.id,
      "SUSPENDED",
      "Suspeita de uso indevido",
    );

    expect(updated.status).toBe("SUSPENDED");
    const entry = audit.byAction("membership.status_changed")[0];
    expect(entry?.before).toEqual({ status: "ACTIVE" });
    expect(entry?.after).toEqual({ status: "SUSPENDED" });
    expect(entry?.justification).toBe("Suspeita de uso indevido");
  });

  it("requires a justification", async () => {
    const { service, owner, org, membership } = await withMembers();
    await expect(
      service.changeMembershipStatus(ctxFor(org.id, owner.id), membership.id, "SUSPENDED", " "),
    ).rejects.toThrow(ValidationFailedError);
  });

  it("blocks changing your own membership", async () => {
    const { service, owner, org, memberships } = await withMembers();
    const own = await memberships.findByOrgAndUser(org.id, owner.id);

    await expect(
      service.changeMembershipStatus(
        ctxFor(org.id, owner.id),
        own!.id,
        "SUSPENDED",
        "tentativa de auto-suspensão",
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("never deactivates the last active OWNER", async () => {
    const { service, owner, org, users, memberships } = await withMembers();
    // second admin who tries to suspend the only owner
    const admin = await users.create({ email: "adm@x.com", name: "Adm", passwordHash: "x" });
    await memberships.create({ organizationId: org.id, userId: admin.id, role: "ADMIN" });
    const ownerMembership = await memberships.findByOrgAndUser(org.id, owner.id);

    await expect(
      service.changeMembershipStatus(
        ctxFor(org.id, admin.id, "ADMIN"),
        ownerMembership!.id,
        "SUSPENDED",
        "tentativa",
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("org B owner cannot touch org A memberships", async () => {
    const { service, org, membership, users } = await withMembers();
    const ownerB = await users.create({ email: "b@b.com", name: "B", passwordHash: "x" });
    const orgB = await service.createOrganization(
      { name: "Org B" },
      { userId: ownerB.id, correlationId: "c" },
    );
    expect(org.id).not.toBe(orgB.id);

    await expect(
      service.changeMembershipStatus(ctxFor(orgB.id, ownerB.id), membership.id, "REVOKED", "cross"),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });
});

describe("listMembers", () => {
  it("blocks suspended members", async () => {
    const env = setup();
    const owner = await env.users.create({ email: "o@o.com", name: "O", passwordHash: "x" });
    const org = await env.service.createOrganization(
      { name: "Org" },
      { userId: owner.id, correlationId: "c" },
    );
    const member = await env.users.create({ email: "m@m.com", name: "M", passwordHash: "x" });
    const membership = await env.memberships.create({
      organizationId: org.id,
      userId: member.id,
      role: "SUPPORT",
    });
    await env.memberships.updateStatus(org.id, membership.id, "SUSPENDED");

    await expect(env.service.listMembers(ctxFor(org.id, member.id, "SUPPORT"))).rejects.toThrow(
      NotFoundOrForbiddenError,
    );
  });
});
