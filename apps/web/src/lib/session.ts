import "server-only";

import type { NextResponse } from "next/server";
import { UnauthenticatedError, type RequestContext } from "@ingressos/core";
import { getServices } from "./services";

export const SESSION_COOKIE = "session";
export const TRUSTED_DEVICE_COOKIE = "mfa_device";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // mirrors AuthService TTL
const TRUSTED_DEVICE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // mirrors DEC-012 window

export function setTrustedDeviceCookie(response: NextResponse, rawToken: string): void {
  response.cookies.set(TRUSTED_DEVICE_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
  });
}

export function readTrustedDeviceToken(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === TRUSTED_DEVICE_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/**
 * httpOnly + secure + sameSite=lax (CLAUDE_SECURITY_RULES §21). The raw token
 * lives ONLY in this cookie; the database stores its SHA-256 hash.
 * sameSite=lax also gives baseline CSRF protection for the JSON API.
 */
export function setSessionCookie(response: NextResponse, rawToken: string): void {
  response.cookies.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function readSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  rawToken: string;
}

/** Validates the session cookie. Throws 401 via UnauthenticatedError. */
export async function requireAuth(request: Request): Promise<AuthenticatedUser> {
  const rawToken = readSessionToken(request);
  if (!rawToken) throw new UnauthenticatedError();
  const { userId, sessionId } = await getServices().auth.validateSession(rawToken);
  return { userId, sessionId, rawToken };
}

/**
 * Builds the org-scoped RequestContext from the SESSION plus the orgId route
 * param. The param only selects WHICH organization the caller is addressing —
 * every service verifies the caller's active membership in it before acting
 * (CLAUDE_SECURITY_RULES §6/§7); nothing here is trusted from the body.
 */
export async function requireOrgContext(
  request: Request,
  organizationId: string,
  correlationId: string,
): Promise<RequestContext> {
  const user = await requireAuth(request);
  return {
    organizationId,
    userId: user.userId,
    // Advisory only — authorization derives from the membership lookup
    // inside each service, never from this field.
    role: "member",
    correlationId,
  };
}
