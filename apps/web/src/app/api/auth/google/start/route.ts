import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";

/**
 * Begins the Google OAuth flow. Sets a short-lived, httpOnly `state` cookie for
 * CSRF protection and redirects to Google's consent screen. Client secret is
 * never involved here. Disabled (redirects back) unless GOOGLE_CLIENT_ID is set.
 */
export function GET(request: Request) {
  const origin = process.env.APP_BASE_URL || new URL(request.url).origin;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${origin}/entrar?erro=google_indisponivel`);
  }

  const state = randomBytes(32).toString("base64url");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", `${origin}/api/auth/google/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
