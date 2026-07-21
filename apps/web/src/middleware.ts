import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30d — mirrors lib/session.ts

/**
 * Sliding session on the browser side: RSC pages can't set cookies, so this
 * edge middleware re-stamps the session cookie's 30-day max-age on each panel
 * navigation. It never validates or mints tokens (no DB here) — the server
 * still checks the DB session (revocable + own expiry) on every request; this
 * only keeps an active user's cookie from expiring while they keep using the
 * panel. Pairs with the server-side sliding renewal in AuthService.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }
  return response;
}

export const config = {
  matcher: ["/painel/:path*"],
};
