import type { CustomerRepository } from "../modules/customers/repository";
import type { CustomerRecord } from "../modules/customers/types";
import { nextId } from "./fakes";

export class InMemoryCustomerRepository implements CustomerRepository {
  readonly customers: CustomerRecord[] = [];

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
    const existing = this.customers.find(
      (c) => c.organizationId === data.organizationId && c.email === data.email,
    );
    if (existing) {
      if (data.name !== undefined) existing.name = data.name;
      if (data.phone !== undefined) existing.phone = data.phone;
      if (data.document !== undefined) existing.document = data.document;
      if (data.consentVersion !== undefined) existing.consentVersion = data.consentVersion;
      if (data.consentAt !== undefined) existing.consentAt = data.consentAt;
      if (data.consentOrigin !== undefined) existing.consentOrigin = data.consentOrigin;
      if (data.lastPurchaseAt !== undefined) existing.lastPurchaseAt = data.lastPurchaseAt;
      return existing;
    }
    const record: CustomerRecord = {
      id: nextId("cus"),
      organizationId: data.organizationId,
      email: data.email,
      name: data.name ?? null,
      phone: data.phone ?? null,
      document: data.document ?? null,
      optedOut: false,
      consentVersion: data.consentVersion ?? null,
      consentAt: data.consentAt ?? null,
      consentOrigin: data.consentOrigin ?? null,
      lastPurchaseAt: data.lastPurchaseAt ?? null,
      anonymizedAt: null,
    };
    this.customers.push(record);
    return record;
  }

  async listAnonymizationCandidates(cutoff: Date, limit: number) {
    return this.customers
      .filter(
        (c) =>
          c.anonymizedAt === null &&
          c.lastPurchaseAt !== null &&
          c.lastPurchaseAt.getTime() < cutoff.getTime(),
      )
      .slice(0, limit);
  }

  async listLeadAnonymizationCandidates(cutoff: Date, limit: number) {
    return this.customers
      .filter(
        (c) =>
          c.anonymizedAt === null &&
          c.lastPurchaseAt === null &&
          c.consentAt !== null &&
          c.consentAt.getTime() < cutoff.getTime(),
      )
      .slice(0, limit);
  }

  async anonymize(
    organizationId: string,
    id: string,
    data: { email: string; name: string; anonymizedAt: Date },
  ) {
    const c = this.customers.find((x) => x.id === id && x.organizationId === organizationId);
    if (!c) throw new Error("Customer not found in organization scope");
    c.email = data.email;
    c.name = data.name;
    c.phone = null;
    c.document = null;
    c.optedOut = true;
    c.anonymizedAt = data.anonymizedAt;
  }

  async listByOrganization(organizationId: string) {
    return this.customers.filter((c) => c.organizationId === organizationId);
  }

  async findByEmail(organizationId: string, email: string) {
    return (
      this.customers.find((c) => c.organizationId === organizationId && c.email === email) ?? null
    );
  }

  async findByPhone(organizationId: string, phone: string) {
    return (
      this.customers.find(
        (c) =>
          c.organizationId === organizationId && c.phone === phone && c.anonymizedAt === null,
      ) ?? null
    );
  }

  async setOptOut(organizationId: string, email: string, optedOut: boolean) {
    const customer = await this.findByEmail(organizationId, email);
    if (!customer) throw new Error("Customer not found in organization scope");
    customer.optedOut = optedOut;
    return customer;
  }
}
