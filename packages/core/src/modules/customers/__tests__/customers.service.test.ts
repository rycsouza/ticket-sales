import { describe, expect, it } from "vitest";
import { NotFoundOrForbiddenError } from "../../../shared/errors";
import type { RequestContext } from "../../../shared/context";
import { FakeClock, InMemoryAuditRepository, InMemoryMembershipRepository } from "../../../testing/fakes";
import { InMemoryCustomerRepository } from "../../../testing/fakes-customers";
import { CustomersService, type CrmOrderReader } from "../service";

const ORG = "org_crm";

/** Deterministic paid-order aggregate reader + anonymization tracker. */
function orderReader(
  rows: { buyerEmail: string; orderCount: number; totalCents: number; eventId?: string }[],
): CrmOrderReader & { anonymized: { email: string; pseudo: string }[] } {
  const anonymized: { email: string; pseudo: string }[] = [];
  return {
    anonymized,
    aggregatePaidByBuyer: async (_org, eventId) =>
      rows
        .filter((r) => !eventId || r.eventId === eventId)
        .map((r) => ({ buyerEmail: r.buyerEmail, orderCount: r.orderCount, totalCents: r.totalCents })),
    anonymizeBuyer: async (_org, email, pseudonym) => {
      anonymized.push({ email, pseudo: pseudonym.email });
      return 1;
    },
  };
}

async function setup(
  rows: { buyerEmail: string; orderCount: number; totalCents: number; eventId?: string }[],
) {
  const clock = new FakeClock();
  const audit = new InMemoryAuditRepository();
  const memberships = new InMemoryMembershipRepository();
  const customers = new InMemoryCustomerRepository();
  await memberships.create({ organizationId: ORG, userId: "u_admin", role: "ADMIN" });
  await memberships.create({ organizationId: ORG, userId: "u_promo", role: "PROMOTER" });
  const orders = orderReader(rows);
  const service = new CustomersService({ customers, orders, memberships, audit, clock });
  const adminCtx: RequestContext = {
    organizationId: ORG,
    userId: "u_admin",
    role: "member",
    correlationId: "c",
  };
  return { clock, audit, memberships, customers, orders, service, adminCtx };
}

describe("upsertFromPaidOrder (FR-CRM-001/002)", () => {
  it("adds the buyer with checkout consent; refreshes on repeat without flipping opt-out", async () => {
    const s = await setup([]);
    await s.service.upsertFromPaidOrder({
      organizationId: ORG,
      buyerEmail: "a@x.com",
      buyerName: "Ana",
      buyerPhone: null,
      buyerDocument: null,
      paidAt: new Date("2026-07-18T12:00:00Z"),
    });
    // opt the customer out, then a new purchase upserts again
    await s.customers.setOptOut(ORG, "a@x.com", true);
    await s.service.upsertFromPaidOrder({
      organizationId: ORG,
      buyerEmail: "a@x.com",
      buyerName: "Ana Silva",
      buyerPhone: "81999",
      buyerDocument: null,
      paidAt: new Date(),
    });
    const c = await s.customers.findByEmail(ORG, "a@x.com");
    expect(c?.name).toBe("Ana Silva");
    expect(c?.consentVersion).toBe("checkout-terms-v1");
    expect(c?.optedOut).toBe(true); // upsert must NOT re-opt-in
  });
});

describe("segments (FR-CRM-003/008, EP-08)", () => {
  it("counts are reproducible and exclude opted-out by default", async () => {
    const s = await setup([
      { buyerEmail: "a@x.com", orderCount: 3, totalCents: 30_000 },
      { buyerEmail: "b@x.com", orderCount: 1, totalCents: 5_000 },
      { buyerEmail: "c@x.com", orderCount: 2, totalCents: 20_000 },
    ]);
    // register customers + opt one out
    for (const email of ["a@x.com", "b@x.com", "c@x.com"]) {
      await s.customers.upsert({ organizationId: ORG, email });
    }
    await s.customers.setOptOut(ORG, "b@x.com", true);

    const all = await s.service.getSegment(s.adminCtx, {});
    expect(all.count).toBe(2); // b opted out
    expect(all.totalSpentCents).toBe(50_000);

    const withOptOut = await s.service.getSegment(s.adminCtx, { includeOptedOut: true });
    expect(withOptOut.count).toBe(3);

    const loyal = await s.service.getSegment(s.adminCtx, { minOrders: 2 });
    expect(loyal.customers.map((r) => r.email)).toEqual(["a@x.com", "c@x.com"]);

    const bigSpenders = await s.service.getSegment(s.adminCtx, { minSpentCents: 25_000 });
    expect(bigSpenders.customers.map((r) => r.email)).toEqual(["a@x.com"]);
  });

  it("export audits the read (FR-CRM-007)", async () => {
    const s = await setup([{ buyerEmail: "a@x.com", orderCount: 1, totalCents: 5_000 }]);
    await s.service.getSegmentForExport(s.adminCtx, {});
    expect(s.audit.byAction("crm.segment_exported")).toHaveLength(1);
  });

  it("denies a promoter (not CRM role)", async () => {
    const s = await setup([]);
    const promoterCtx: RequestContext = {
      organizationId: ORG,
      userId: "u_promo",
      role: "member",
      correlationId: "c",
    };
    await expect(s.service.getSegment(promoterCtx, {})).rejects.toBeInstanceOf(
      NotFoundOrForbiddenError,
    );
  });
});

describe("phone lookup for checkout reuse", () => {
  it("normalizes phone on upsert, returns a MASKED match, resolves real data server-side", async () => {
    const s = await setup([]);
    await s.service.upsertFromPaidOrder({
      organizationId: ORG,
      buyerEmail: "rychard@demo.com.br",
      buyerName: "Rychard Demo",
      buyerPhone: "(67) 98429-9967",
      buyerDocument: null,
      paidAt: new Date(),
    });

    // stored as digits only
    const stored = await s.customers.findByPhone(ORG, "67984299967");
    expect(stored?.phone).toBe("67984299967");

    // public lookup by a differently-formatted phone → masked only
    const masked = await s.service.lookupByPhone(ORG, "67 98429-9967");
    expect(masked.found).toBe(true);
    expect(masked.maskedName).toBe("Rychard ***");
    expect(masked.maskedEmail).toBe("rych***@demo.com.br");

    // server-side resolve returns the real identity (never sent to the client)
    const real = await s.service.resolveByPhone(ORG, "(67) 98429-9967");
    expect(real).toEqual({ name: "Rychard Demo", email: "rychard@demo.com.br" });
  });

  it("returns not-found for unknown phone and never crosses organizations", async () => {
    const s = await setup([]);
    await s.service.upsertFromPaidOrder({
      organizationId: ORG,
      buyerEmail: "a@x.com",
      buyerName: "Ana",
      buyerPhone: "11999998888",
      buyerDocument: null,
      paidAt: new Date(),
    });
    expect((await s.service.lookupByPhone(ORG, "11000000000")).found).toBe(false);
    expect((await s.service.lookupByPhone("org_other", "11999998888")).found).toBe(false);
    expect(await s.service.resolveByPhone("org_other", "11999998888")).toBeNull();
  });
});

describe("retention / anonymization (DEC-010, LGPD)", () => {
  it("anonymizes buyers inactive beyond the window, idempotently", async () => {
    const s = await setup([]);
    const old = new Date("2023-01-01T00:00:00Z"); // > 24 months before 'now'
    const recent = new Date("2026-07-01T00:00:00Z");
    await s.customers.upsert({ organizationId: ORG, email: "old@x.com", name: "Antigo", lastPurchaseAt: old });
    await s.customers.upsert({ organizationId: ORG, email: "new@x.com", name: "Recente", lastPurchaseAt: recent });

    const now = new Date("2026-07-18T00:00:00Z");
    const count = await s.service.runRetention(now, 100);
    expect(count).toBe(1);

    const oldC = await s.customers.findByEmail(ORG, "old@x.com");
    expect(oldC).toBeNull(); // e-mail was pseudonymized
    expect(s.orders.anonymized).toEqual([
      { email: "old@x.com", pseudo: expect.stringContaining("@anonimizado.local") },
    ]);
    const stillThere = await s.customers.findByEmail(ORG, "new@x.com");
    expect(stillThere?.anonymizedAt).toBeNull();

    // Idempotent: a second run finds nothing new
    expect(await s.service.runRetention(now, 100)).toBe(0);
  });

  it("erases a customer on request (audited); denies non-CRM", async () => {
    const s = await setup([]);
    await s.customers.upsert({ organizationId: ORG, email: "erase@x.com", name: "Apagar" });
    await s.service.anonymizeCustomer(s.adminCtx, "erase@x.com");
    expect(await s.customers.findByEmail(ORG, "erase@x.com")).toBeNull();
    expect(s.audit.byAction("crm.customer_anonymized")).toHaveLength(1);

    const promoterCtx: RequestContext = {
      organizationId: ORG,
      userId: "u_promo",
      role: "member",
      correlationId: "c",
    };
    await expect(
      s.service.anonymizeCustomer(promoterCtx, "erase@x.com"),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });
});
