import { loadServerEnv } from "@ingressos/config";

/**
 * Allowlist de admins da plataforma (DEC-003) — a ÚNICA fonte de verdade é a
 * env PLATFORM_ADMIN_EMAILS. Vive em módulo próprio (sem depender de
 * services.ts) para que o composition root possa importá-la sem ciclo.
 */
function adminEmails(): Set<string> {
  const raw = loadServerEnv().PLATFORM_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.trim().toLowerCase());
}
