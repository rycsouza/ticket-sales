import type { RequestContext } from "../../shared/context";
import { NotFoundOrForbiddenError } from "../../shared/errors";
import type { MembershipRecord, MembershipRole } from "./types";

/** Narrow lookup interface so other modules depend only on what they need. */
export interface MembershipLookup {
  findByOrgAndUser(organizationId: string, userId: string): Promise<MembershipRecord | null>;
}

/**
 * Backend authorization primitive (CLAUDE_SECURITY_RULES §6): the caller must
 * hold an ACTIVE membership in ctx.organizationId with one of the allowed
 * roles. Throws the generic not-found-or-forbidden error otherwise.
 */
export async function requireActiveRole(
  memberships: MembershipLookup,
  ctx: RequestContext,
  allowedRoles: readonly MembershipRole[],
): Promise<MembershipRecord> {
  const membership = await memberships.findByOrgAndUser(ctx.organizationId, ctx.userId);
  if (!membership || membership.status !== "ACTIVE" || !allowedRoles.includes(membership.role)) {
    throw new NotFoundOrForbiddenError();
  }
  return membership;
}
