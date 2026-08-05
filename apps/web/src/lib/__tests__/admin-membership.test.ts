import { describe, expect, it } from "vitest";
import type { MembershipRecord } from "@ingressos/core";
import { withPlatformAdminAccess } from "../admin-membership";

const realMembership = (over: Partial<MembershipRecord> = {}): MembershipRecord => ({
  id: "m1",
  organizationId: "org-a",
  userId: "u1",
  role: "SUPPORT",
  status: "ACTIVE",
  ...over,
});

class FakeMemberships {
  constructor(private readonly record: MembershipRecord | null) {}
  calls = 0;
  async findByOrgAndUser(organizationId: string, userId: string) {
    this.calls += 1;
    if (!this.record) return null;
    return this.record.organizationId === organizationId && this.record.userId === userId
      ? this.record
      : null;
  }
  async listByUser(userId: string) {
    return [{ userId }];
  }
}

const admin = async () => true;
const notAdmin = async () => false;

describe("withPlatformAdminAccess", () => {
  it("grants a synthetic ACTIVE OWNER membership in ANY org to a platform admin", async () => {
    const wrapped = withPlatformAdminAccess(new FakeMemberships(null), admin);
    const m = await wrapped.findByOrgAndUser("org-b", "admin-user");
    expect(m).toMatchObject({
      organizationId: "org-b",
      userId: "admin-user",
      role: "OWNER",
      status: "ACTIVE",
    });
  });

  it("upgrades an admin's weaker/suspended real membership to synthetic OWNER", async () => {
    const wrapped = withPlatformAdminAccess(
      new FakeMemberships(realMembership({ role: "SUPPORT", status: "SUSPENDED" })),
      admin,
    );
    const m = await wrapped.findByOrgAndUser("org-a", "u1");
    expect(m?.role).toBe("OWNER");
    expect(m?.status).toBe("ACTIVE");
  });

  it("returns the REAL membership when the admin already is an active OWNER", async () => {
    const owner = realMembership({ role: "OWNER" });
    const wrapped = withPlatformAdminAccess(new FakeMemberships(owner), admin);
    expect(await wrapped.findByOrgAndUser("org-a", "u1")).toBe(owner);
  });

  it("changes NOTHING for non-admin users (member and non-member)", async () => {
    const support = realMembership();
    const wrapped = withPlatformAdminAccess(new FakeMemberships(support), notAdmin);
    expect(await wrapped.findByOrgAndUser("org-a", "u1")).toBe(support);
    expect(await wrapped.findByOrgAndUser("org-b", "u1")).toBeNull();
  });

  it("fails closed when the admin predicate throws", async () => {
    const wrapped = withPlatformAdminAccess(new FakeMemberships(null), async () => {
      throw new Error("allowlist unavailable");
    });
    expect(await wrapped.findByOrgAndUser("org-a", "u1")).toBeNull();
  });

  it("delegates every other method to the inner repository", async () => {
    const inner = new FakeMemberships(null);
    const wrapped = withPlatformAdminAccess(inner, admin);
    expect(await wrapped.listByUser("u9")).toEqual([{ userId: "u9" }]);
  });
});
