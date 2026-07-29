import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient as PlatformClient } from "./generated/platform-client/index.js";

/**
 * Platform DB client (docs/MULTITENANT.md §2.1) — the control plane: tenant
 * registry (encrypted connection strings) and, from MT-2 on, global identity
 * and public-ref routing. Generated from prisma/platform/schema.prisma into
 * src/generated/platform-client (separate client, separate migration trail).
 *
 * Same per-URL cache rationale as getPrisma: module scope survives warm
 * serverless invocations; nothing throws at module scope.
 */
const globalForPlatform = globalThis as unknown as {
  platformPrismaByUrl?: Map<string, PlatformClient>;
};

export function getPlatformPrisma(datasourceUrl: string): PlatformClient {
  const cache = (globalForPlatform.platformPrismaByUrl ??= new Map<string, PlatformClient>());
  const existing = cache.get(datasourceUrl);
  if (existing) return existing;
  const client = new PlatformClient({
    adapter: new PrismaNeon({ connectionString: datasourceUrl }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  cache.set(datasourceUrl, client);
  return client;
}

export type PlatformPrismaClient = PlatformClient;
