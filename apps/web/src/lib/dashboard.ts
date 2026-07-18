import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { RequestContext } from "@ingressos/core";
import { getServices } from "./services";
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
    return await getServices().auth.validateSession(token);
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
