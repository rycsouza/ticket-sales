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
/**
 * Vocabulário por nicho também nas URLS (docs: lib/org-vocab.ts): o filesystem
 * de rotas é um só (eventos/evento/ingressos); para produtoras de VIAGENS os
 * links são emitidos como viagens/viagem/vagas e reescritos aqui — a URL do
 * navegador preserva o vocabulário, o roteamento interno não muda.
 */
function rewriteNichePath(pathname: string): string | null {
  // /viagem/<slug> → /evento/<slug> (checkout público)
  if (pathname.startsWith("/viagem/")) {
    return `/evento/${pathname.slice("/viagem/".length)}`;
  }
  // /painel/<org>/viagens[/...] → /painel/<org>/eventos[/...]
  // (e o subsegmento /vagas → /ingressos dentro da viagem)
  const panel = pathname.match(/^\/painel\/([^/]+)\/viagens(\/.*)?$/);
  if (panel) {
    const rest = (panel[2] ?? "").replace(/^(\/[^/]+)\/vagas(\/|$)/, "$1/ingressos$2");
    return `/painel/${panel[1]}/eventos${rest}`;
  }
  return null;
}

export function middleware(request: NextRequest) {
  const rewritten = rewriteNichePath(request.nextUrl.pathname);
  const response = rewritten
    ? NextResponse.rewrite(new URL(rewritten + request.nextUrl.search, request.url))
    : NextResponse.next();

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
  matcher: ["/painel/:path*", "/viagem/:path*"],
};
