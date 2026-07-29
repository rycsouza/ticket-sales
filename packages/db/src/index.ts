import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma clients over the Neon serverless driver adapter (Prisma 7 is
 * Rust-engine-free and connects through driver adapters). URLs are injected
 * from the validated env — never read implicitly. Laziness matters: nothing
 * may throw at module scope, or Next's build-time page-data collection fails.
 *
 * Cached PER URL (docs/MULTITENANT.md §4). The previous singleton used
 * `prisma ??= …`, which silently ignored the URL after the first call — in a
 * database-per-tenant world the first tenant to warm a serverless instance
 * would serve its database to every other tenant. The Map keyed by URL keeps
 * the serverless connection-reuse property (ARQUITETURA §6) without that trap.
 */
const globalForPrisma = globalThis as unknown as { prismaByUrl?: Map<string, PrismaClient> };

export function getPrisma(datasourceUrl: string): PrismaClient {
  const cache = (globalForPrisma.prismaByUrl ??= new Map<string, PrismaClient>());
  const existing = cache.get(datasourceUrl);
  if (existing) return existing;
  const client = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: datasourceUrl }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  cache.set(datasourceUrl, client);
  return client;
}

export type { PrismaClient } from "@prisma/client";

// Multi-tenant control plane (docs/MULTITENANT.md)
export { encryptWithKey, decryptWithKey } from "./encryption";
export { getPlatformPrisma, type PlatformPrismaClient } from "./platform";
export { TenantDbResolver, TenantResolutionError, type TenantDbConfig } from "./tenant";
