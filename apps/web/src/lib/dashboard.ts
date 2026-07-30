import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { RequestContext } from "@ingressos/core";
import { getPlatformServices } from "./services";
import { SESSION_COOKIE } from "./session";

/**
 * Server-side session guard for dashboard RSC pages. Reads the httpOnly session
 * cookie, validates it, and redirects to /entrar when absent/invalid. Returns
 * the authenticated user id.
 */
export async function requireDashboardUser(): Promise<{ userId: string }> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/entrar");
  try {
    return await getPlatformServices().auth.validateSession(token);
  } catch {
    redirect("/entrar");
  }
}

/**
 * Builds an org-scoped context from the SESSION for a dashboard read. The org
 * id only SELECTS which organization is addressed — every service re-verifies
 * the caller's active membership before acting (CLAUDE_SECURITY_RULES §6/§7).
 */
export function dashboardCtx(organizationId: string, userId: string): RequestContext {
  return { organizationId, userId, role: "member", correlationId: crypto.randomUUID() };
}

/**
 * Resolve the `[orgId]` URL segment — which now carries the org SLUG — to the
 * real organization the user belongs to. Legacy UUID links keep working (we
 * match by slug OR id). Redirects to the org resolver when the caller has no
 * membership (anti-enumeration; same as an unknown org).
 */
export async function resolveOrg(
  orgParam: string,
  userId: string,
): Promise<{
  id: string;
  slug: string;
  name: string;
  role: string;
  timezone: string;
  niche: "EVENTOS" | "VIAGENS";
}> {
  const orgs = await getPlatformServices().identity.listMyOrganizations(userId);
  const match = orgs.find(
    (o) => o.organization.slug === orgParam || o.organization.id === orgParam,
  );
  if (!match) redirect("/painel");
  return {
    id: match.organization.id,
    slug: match.organization.slug,
    name: match.organization.name,
    role: match.role,
    timezone: match.organization.timezone,
    niche: match.organization.niche,
  };
}
