import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requestMetaFrom } from "@/lib/http";
import { getServices } from "@/lib/services";
import { setSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** id_token comes directly from Google over TLS (token endpoint), so its
 * payload is trusted without a separate JWK signature check (per Google docs). */
function decodeIdToken(idToken: string): {
  email?: string;
  email_verified?: boolean | string;
  name?: string;
} | null {
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.APP_BASE_URL || url.origin;
  const fail = (reason: string) => NextResponse.redirect(`${origin}/entrar?erro=${reason}`);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("google_indisponivel");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = readCookie(request, STATE_COOKIE);
  // CSRF: the state echoed by Google must match the one we set in the cookie.
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("google_falhou");
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail("google_falhou");

    const token = (await tokenRes.json()) as { id_token?: string };
    const claims = token.id_token ? decodeIdToken(token.id_token) : null;
    if (!claims?.email) return fail("google_falhou");

    const meta = requestMetaFrom(request, randomUUID());
    const result = await getServices().auth.loginWithFederatedIdentity(
      {
        email: claims.email,
        name: claims.name ?? "",
        emailVerified: claims.email_verified === true || claims.email_verified === "true",
      },
      meta,
    );

    const response = NextResponse.redirect(`${origin}/painel`);
    response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    setSessionCookie(response, result.rawToken);
    return response;
  } catch {
    return fail("google_falhou");
  }
}
