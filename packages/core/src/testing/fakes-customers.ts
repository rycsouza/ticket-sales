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
    };
    this.customers.push(record);
    return record;
  }

  async listByOrganization(organizationId: string) {
    return this.customers.filter((c) => c.organizationId === organizationId);
  }

  async findByEmail(organizationId: string, email: string) {
    return (
      this.customers.find((c) => c.organizationId === organizationId && c.email === email) ?? null
    );
  }

  async setOptOut(organizationId: string, email: string, optedOut: boolean) {
    const customer = await this.findByEmail(organizationId, email);
    if (!customer) throw new Error("Customer not found in organization scope");
    customer.optedOut = optedOut;
    return customer;
  }
}
