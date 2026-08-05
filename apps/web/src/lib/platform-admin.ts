import "server-only";

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPlatformServices } from "./services";
import { SESSION_COOKIE } from "./session";
import { isPlatformAdminEmail } from "./platform-admin-allowlist";

/**
 * Platform-admin gate (DEC-003). There is no platform-admin ROLE — the only
 * gate is the PLATFORM_ADMIN_EMAILS env allowlist. Everything under /plataforma
 * and /api/admin MUST call requirePlatformAdmin() before doing anything.
 * A allowlist em si vive em ./platform-admin-allowlist (compartilhada com o
 * composition root sem ciclo de import).
 */
export { isPlatformAdminEmail } from "./platform-admin-allowlist";

/** True when the current session belongs to a platform admin (nav gating). */
export async function currentUserIsPlatformAdmin(): Promise<boolean> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return false;
    const { userId } = await getPlatformServices().auth.validateSession(token);
    const user = await getPlatformServices().auth.getUserById(userId);
    return isPlatformAdminEmail(user?.email);
  } catch {
    return false;
  }
}

/**
 * Resolve the platform admin behind the current session, or null. For API
 * routes, which respond with a generic 404 JSON when null (anti-enumeration).
 */
export async function resolvePlatformAdmin(): Promise<{ userId: string; email: string } | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { userId } = await getPlatformServices().auth.validateSession(token);
    const user = await getPlatformServices().auth.getUserById(userId);
    if (!user || !isPlatformAdminEmail(user.email)) return null;
    return { userId, email: user.email };
  } catch {
    return null;
  }
}

/**
 * Enforce platform-admin access on RSC pages. Returns the admin's identity, or
 * renders a generic 404 (a non-admin must not learn the surface exists).
 */
export async function requirePlatformAdmin(): Promise<{ userId: string; email: string }> {
  const admin = await resolvePlatformAdmin();
  if (!admin) notFound();
  return admin;
}
