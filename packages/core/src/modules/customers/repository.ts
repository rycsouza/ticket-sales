import type { PrismaClient } from "@ingressos/db";
import type { CustomerRecord } from "./types";

export interface CustomerRepository {
  /** Idempotent upsert on (organizationId, email) — called on paid orders. */
  upsert(data: {
    organizationId: string;
    email: string;
    name?: string | undefined;
    phone?: string | undefined;
    document?: string | undefined;
    consentVersion?: string | undefined;
    consentAt?: Date | undefined;
    consentOrigin?: string | undefined;
  }): Promise<CustomerRecord>;
  listByOrganization(organizationId: string): Promise<CustomerRecord[]>;
  findByEmail(organizationId: string, email: string): Promise<CustomerRecord | null>;
  setOptOut(organizationId: string, email: string, optedOut: boolean): Promise<CustomerRecord>;
}

const customerSelect = {
  id: true,
  organizationId: true,
  email: true,
  name: true,
  phone: true,
  document: true,
  optedOut: true,
  consentVersion: true,
  consentAt: true,
  consentOrigin: true,
} as const;

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(data: {
    organizationId: string;
    email: string;
    name?: string | undefined;
    phone?: string | undefined;
    document?: string | undefined;
    consentVersion?: string | undefined;
    consentAt?: Date | undefined;
    consentOrigin?: string | undefined;
  }) {
    // Consent fields are set on first sight and refreshed only when provided.
    // opt-out is NEVER changed here — only via the explicit setOptOut path.
    const consent = {
      ...(data.consentVersion !== undefined ? { consentVersion: data.consentVersion } : {}),
      ...(data.consentAt !== undefined ? { consentAt: data.consentAt } : {}),
      ...(data.consentOrigin !== undefined ? { consentOrigin: data.consentOrigin } : {}),
    };
    return this.prisma.customer.upsert({
      where: {
        organizationId_email: { organizationId: data.organizationId, email: data.email },
      },
      create: {
        organizationId: data.organizationId,
        email: data.email,
        name: data.name ?? null,
        phone: data.phone ?? null,
        document: data.document ?? null,
        ...consent,
      },
      update: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.document !== undefined ? { document: data.document } : {}),
        ...consent,
      },
      select: customerSelect,
    });
  }

  async listByOrganization(organizationId: string) {
    return this.prisma.customer.findMany({
      where: { organizationId },
      select: customerSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async findByEmail(organizationId: string, email: string) {
    return this.prisma.customer.findFirst({
      where: { organizationId, email },
      select: customerSelect,
    });
  }

  async setOptOut(organizationId: string, email: string, optedOut: boolean) {
    const result = await this.prisma.customer.updateMany({
      where: { organizationId, email },
      data: { optedOut },
    });
    if (result.count === 0) throw new Error("Customer not found in organization scope");
    const updated = await this.findByEmail(organizationId, email);
    if (!updated) throw new Error("Customer vanished after update");
    return updated;
  }
}
