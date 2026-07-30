import type { RequestContext } from "../../shared/context";
import { ValidationFailedError } from "../../shared/errors";
import type { PublicImageStoragePort } from "../../ports/image-storage";
import type { AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import type {
  OrgLandingPageRecord,
  OrgLandingPageRepository,
  PublicStorefront,
} from "./repository";
import {
  parseStoredTrustItems,
  type StorefrontImageKind,
  type UpdateOrgLandingPageInput,
} from "./schemas";

/** Quem pode configurar a vitrine da produtora. */
export const STOREFRONT_MANAGER_ROLES = ["OWNER", "ADMIN"] as const;

// Mesmas regras da página de evento: SVG/ICO fora (XSS); Cloudinary re-encoda.
const IMAGE_LIMITS: Record<StorefrontImageKind, { maxBytes: number }> = {
  hero: { maxBytes: 5 * 1024 * 1024 },
  logo: { maxBytes: 1 * 1024 * 1024 },
};
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface StorefrontServiceDeps {
  pages: OrgLandingPageRepository;
  memberships: MembershipLookup;
  audit: AuditRepository;
  images: PublicImageStoragePort;
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
   * Upload de imagem da vitrine (capa/logo). A pasta é derivada do contexto
   * autenticado — nunca do cliente. Devolve a URL do CDN para o editor salvar.
   */
  async uploadImage(
    ctx: RequestContext,
    kind: StorefrontImageKind,
    body: Uint8Array,
    contentType: string,
  ): Promise<{ url: string }> {
    await requireActiveRole(this.deps.memberships, ctx, STOREFRONT_MANAGER_ROLES);

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new ValidationFailedError("Formato de imagem não suportado (use JPEG, PNG ou WebP)");
    }
    if (body.byteLength === 0) {
      throw new ValidationFailedError("Arquivo de imagem vazio");
    }
    const limit = IMAGE_LIMITS[kind];
    if (body.byteLength > limit.maxBytes) {
      const maxMb = Math.round(limit.maxBytes / (1024 * 1024));
      throw new ValidationFailedError(`Imagem excede o limite de ${maxMb} MB`);
    }

    const { url } = await this.deps.images.upload({
      folder: `orgs/${ctx.organizationId}/storefront`,
      body,
      contentType,
    });

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "storefront.image_uploaded",
      resourceType: "org_landing_page",
      resourceId: ctx.organizationId,
      after: { kind, url, bytes: body.byteLength },
      correlationId: ctx.correlationId,
    });

    return { url };
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
