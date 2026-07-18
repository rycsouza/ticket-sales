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
    lastPurchaseAt?: Date | undefined;
  }): Promise<CustomerRecord>;
  listByOrganization(organizationId: string): Promise<CustomerRecord[]>;
  findByEmail(organizationId: string, email: string): Promise<CustomerRecord | null>;
  /** Phone-based lookup for checkout (normalized digits). Excludes anonymized rows. */
  findByPhone(organizationId: string, phone: string): Promise<CustomerRecord | null>;
  setOptOut(organizationId: string, email: string, optedOut: boolean): Promise<CustomerRecord>;
  /** DEC-010 — active buyers whose last purchase predates the cutoff. */
  listAnonymizationCandidates(cutoff: Date, limit: number): Promise<CustomerRecord[]>;
  /** Replaces PII with a pseudonym; stamps anonymizedAt (idempotent). */
  anonymize(
    organizationId: string,
    id: string,
    data: { email: string; name: string; anonymizedAt: Date },
  ): Promise<void>;
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
  lastPurchaseAt: true,
  anonymizedAt: true,
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
    lastPurchaseAt?: Date | undefined;
  }) {
    // Consent fields are set on first sight and refreshed only when provided.
    // opt-out is NEVER changed here — only via the explicit setOptOut path.
    const consent = {
      ...(data.consentVersion !== undefined ? { consentVersion: data.consentVersion } : {}),
      ...(data.consentAt !== undefined ? { consentAt: data.consentAt } : {}),
      ...(data.consentOrigin !== undefined ? { consentOrigin: data.consentOrigin } : {}),
      ...(data.lastPurchaseAt !== undefined ? { lastPurchaseAt: data.lastPurchaseAt } : {}),
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

  async listAnonymizationCandidates(cutoff: Date, limit: number) {
    return this.prisma.customer.findMany({
      where: { anonymizedAt: null, lastPurchaseAt: { not: null, lt: cutoff } },
      select: customerSelect,
      take: limit,
      orderBy: { lastPurchaseAt: "asc" },
    });
  }

  async anonymize(
    organizationId: string,
    id: string,
    data: { email: string; name: string; anonymizedAt: Date },
  ) {
    const result = await this.prisma.customer.updateMany({
      where: { id, organizationId },
      data: {
        email: data.email,
        name: data.name,
        phone: null,
        document: null,
        optedOut: true, // anonymized contacts are never targeted again
        anonymizedAt: data.anonymizedAt,
      },
    });
    if (result.count === 0) throw new Error("Customer not found in organization scope");
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

  async findByPhone(organizationId: string, phone: string) {
    return this.prisma.customer.findFirst({
      where: { organizationId, phone, anonymizedAt: null },
      select: customerSelect,
      orderBy: { lastPurchaseAt: "desc" },
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
