import { describe, expect, it } from "vitest";
import { NotFoundOrForbiddenError } from "../../../shared/errors";
import type { RequestContext } from "../../../shared/context";
import { FakeClock, InMemoryAuditRepository, InMemoryMembershipRepository } from "../../../testing/fakes";
import { InMemoryCustomerRepository } from "../../../testing/fakes-customers";
import { CustomersService, type CrmOrderReader } from "../service";

const ORG = "org_crm";

/** Deterministic paid-order aggregate reader. */
function orderReader(
  rows: { buyerEmail: string; orderCount: number; totalCents: number; eventId?: string }[],
): CrmOrderReader {
  return {
    aggregatePaidByBuyer: async (_org, eventId) =>
      rows
        .filter((r) => !eventId || r.eventId === eventId)
        .map((r) => ({ buyerEmail: r.buyerEmail, orderCount: r.orderCount, totalCents: r.totalCents })),
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
  const service = new CustomersService({
    customers,
    orders: orderReader(rows),
    memberships,
    audit,
    clock,
  });
  const adminCtx: RequestContext = {
    organizationId: ORG,
    userId: "u_admin",
    role: "member",
    correlationId: "c",
  };
  return { clock, audit, memberships, customers, service, adminCtx };
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
