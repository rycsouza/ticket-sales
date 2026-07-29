import type { PlatformPrismaClient } from "@ingressos/db";
import type { PublicRefKind, PublicRefPort } from "../../ports/refs";

/**
 * PublicRef sobre o PLATFORM DB (docs/MULTITENANT.md §2.1). O @@id(kind,key)
 * do schema faz a reserva ser atômica: dois tenants disputando a mesma chave
 * resolvem no banco, nunca na aplicação.
 */
export class PrismaPublicRefRepository implements PublicRefPort {
  constructor(private readonly prisma: PlatformPrismaClient) {}

  async reserve(kind: PublicRefKind, key: string, organizationId: string): Promise<boolean> {
    try {
      await this.prisma.publicRef.create({ data: { kind, key, organizationId } });
      return true;
    } catch {
      // Unique violation — reserved. Idempotent when it is OUR reservation.
      const existing = await this.prisma.publicRef.findUnique({
        where: { kind_key: { kind, key } },
        select: { organizationId: true },
      });
      return existing?.organizationId === organizationId;
    }
  }

  async resolve(kind: PublicRefKind, key: string): Promise<string | null> {
    const ref = await this.prisma.publicRef.findUnique({
      where: { kind_key: { kind, key } },
      select: { organizationId: true },
    });
    return ref?.organizationId ?? null;
  }

  async release(kind: PublicRefKind, key: string, organizationId: string): Promise<void> {
    await this.prisma.publicRef.deleteMany({ where: { kind, key, organizationId } });
  }
}
