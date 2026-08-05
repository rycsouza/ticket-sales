import type { MembershipLookup, MembershipRecord } from "@ingressos/core";

/**
 * Acesso ONIPRESENTE do admin da plataforma (DEC-003): decora o repositório de
 * memberships no composition root para que `findByOrgAndUser` — a primitiva de
 * autorização de TODOS os serviços (requireActiveRole) — devolva um membership
 * OWNER/ACTIVE sintético em QUALQUER organização quando o usuário está na
 * allowlist PLATFORM_ADMIN_EMAILS.
 *
 * Propriedades de segurança:
 * - O predicado `isPlatformAdminUser` é injetado pela borda e deriva da env —
 *   nunca de dado vindo do cliente (o core continua ignorando a allowlist).
 * - Fail-closed: predicado que lança/retorna false → comportamento original.
 * - O registro sintético NUNCA é persistido nem aparece em listagens de
 *   membros (só existe na resposta desta função); auditoria continua com o
 *   actorUserId real do admin.
 */
export function withPlatformAdminAccess<T extends MembershipLookup>(
  inner: T,
  isPlatformAdminUser: (userId: string) => Promise<boolean>,
): T {
  const findByOrgAndUser = async (
    organizationId: string,
    userId: string,
  ): Promise<MembershipRecord | null> => {
    const real = await inner.findByOrgAndUser(organizationId, userId);
    // Membership real já dá o acesso máximo → nada a fazer.
    if (real && real.status === "ACTIVE" && real.role === "OWNER") return real;
    if (await isPlatformAdminUser(userId).catch(() => false)) {
      return {
        id: `platform-admin:${userId}`,
        organizationId,
        userId,
        role: "OWNER",
        status: "ACTIVE",
      };
    }
    return real;
  };

  return new Proxy(inner, {
    get(target, prop) {
      if (prop === "findByOrgAndUser") return findByOrgAndUser;
      // receiver = target (não o proxy) preserva acesso a campos privados.
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
