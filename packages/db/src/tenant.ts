import type { PrismaClient } from "@prisma/client";
import { decryptWithKey } from "./encryption";
import { getPrisma } from "./index";
import { getPlatformPrisma } from "./platform";

/**
 * Tenant DB resolution (docs/MULTITENANT.md §3–4): orgId → Tenant row in the
 * platform DB → decrypt the connection string → per-tenant Prisma client.
 *
 * Fail-closed: unknown org, non-ACTIVE status or undecryptable URL all throw
 * TenantResolutionError with a generic message — the edge maps it to the same
 * anonymous 404 used everywhere (anti-enumeration). The decrypted URL is not
 * retained; only the client is cached (per org, per serverless instance).
 */

export interface TenantDbConfig {
  /** Platform DB pooled connection string (PLATFORM_DATABASE_URL). */
  platformUrl: string;
  /** 64-hex AES-256-GCM key (ENCRYPTION_KEY_PLATFORM_DB). */
  encryptionKeyHex: string;
}

export class TenantResolutionError extends Error {
  constructor() {
    // Generic on purpose — never include the orgId, status or any URL detail.
    super("Tenant not available");
    this.name = "TenantResolutionError";
  }
}

export class TenantDbResolver {
  /** orgId → client. getPrisma() dedupes by URL underneath, so legacy tenants
   *  sharing one physical database also share one connection pool. */
  private readonly clientsByOrg = new Map<string, PrismaClient>();

  constructor(private readonly config: TenantDbConfig) {}

  async getTenantDb(organizationId: string): Promise<PrismaClient> {
    const cached = this.clientsByOrg.get(organizationId);
    if (cached) return cached;

    const platform = getPlatformPrisma(this.config.platformUrl);
    const tenant = await platform.tenant.findUnique({ where: { id: organizationId } });
    if (!tenant || tenant.status !== "ACTIVE") throw new TenantResolutionError();

    let url: string;
    try {
      url = decryptWithKey(tenant.databaseUrlEncrypted, this.config.encryptionKeyHex);
    } catch {
      throw new TenantResolutionError();
    }

    const client = getPrisma(url);
    this.clientsByOrg.set(organizationId, client);
    return client;
  }

  /** Drop this instance's cache for an org (URL/status change). Remember the
   *  cache is per serverless instance — a URL rotation also needs a redeploy
   *  (or instance recycling) to reach every warm instance. */
  invalidateTenant(organizationId: string): void {
    this.clientsByOrg.delete(organizationId);
  }
}
