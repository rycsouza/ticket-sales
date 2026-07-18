import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

/**
 * Lazy Prisma client singleton over the Neon serverless driver adapter
 * (Prisma 7 is Rust-engine-free and connects through driver adapters).
 * The URL is injected from the validated env — never read implicitly.
 * Laziness matters: nothing may throw at module scope, or Next's build-time
 * page-data collection fails.
 *
 * In serverless, module scope survives across warm invocations — reusing the
 * client avoids exhausting Neon's pooled connections (ARQUITETURA §6).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(datasourceUrl: string): PrismaClient {
  globalForPrisma.prisma ??= new PrismaClient({
    adapter: new PrismaNeon({ connectionString: datasourceUrl }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  return globalForPrisma.prisma;
}

export type { PrismaClient } from "@prisma/client";
