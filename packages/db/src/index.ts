import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. In serverless, module scope survives across warm
 * invocations — reusing the client avoids exhausting Neon's pooled
 * connections (ARQUITETURA §6).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient } from "@prisma/client";
