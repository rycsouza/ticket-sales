import type { RequestContext } from "../../shared/context";
import type { AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import type {
  OrgLandingPageRecord,
  OrgLandingPageRepository,
  PublicStorefront,
} from "./repository";
import { parseStoredTrustItems, type UpdateOrgLandingPageInput } from "./schemas";

/** Quem pode configurar a vitrine da produtora. */
export const STOREFRONT_MANAGER_ROLES = ["OWNER", "ADMIN"] as const;

export interface StorefrontServiceDeps {
  pages: OrgLandingPageRepository;
  memberships: MembershipLookup;
  audit: AuditRepository;
}

export class StorefrontService {
  constructor(private readonly deps: StorefrontServiceDeps) {}

  /** Config atual para o editor do painel (membro gestor; ausente → defaults). */
  async getForOrg(ctx: RequestContext): Promise<OrgLandingPageRecord | null> {
    await requireActiveRole(this.deps.memberships, ctx, STOREFRONT_MANAGER_ROLES);
    return this.deps.pages.findByOrganizationId(ctx.organizationId);
  }

  /** Upsert da vitrine — OWNER/ADMIN, auditado (before/after de `enabled`). */
  async update(
    ctx: RequestContext,
    input: UpdateOrgLandingPageInput,
  ): Promise<OrgLandingPageRecord> {
    await requireActiveRole(this.deps.memberships, ctx, STOREFRONT_MANAGER_ROLES);
    const current = await this.deps.pages.findByOrganizationId(ctx.organizationId);
    const enabledBefore = current?.enabled ?? false;

    const page = await this.deps.pages.upsert(ctx.organizationId, input);

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "storefront.updated",
      resourceType: "org_landing_page",
      resourceId: ctx.organizationId,
      before: { enabled: enabledBefore },
      after: { enabled: page.enabled, fields: Object.keys(input) },
      correlationId: ctx.correlationId,
    });
    return page;
  }

  /**
   * Resolução pública de /<org-slug>: só páginas HABILITADAS de orgs ativas;
   * qualquer outro caso → null (404 genérico, anti-enumeração). trustItems é
   * re-validado na leitura (JSON corrompido → lista vazia).
   */
  async getPublicBySlug(
    slug: string,
  ): Promise<(PublicStorefront & { trustItems: ReturnType<typeof parseStoredTrustItems> }) | null> {
    const storefront = await this.deps.pages.findEnabledByOrgSlug(slug);
    if (!storefront) return null;
    return { ...storefront, trustItems: parseStoredTrustItems(storefront.page.trustItems) };
  }

  /** Vitrines habilitadas para o sitemap. */
  async listEnabled(): Promise<{ orgSlug: string; updatedAt: Date }[]> {
    return this.deps.pages.listEnabled();
  }
}
