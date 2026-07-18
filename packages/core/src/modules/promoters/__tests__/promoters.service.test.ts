import { describe, expect, it } from "vitest";
import { NotFoundOrForbiddenError, ValidationFailedError } from "../../../shared/errors";
import type { RequestContext } from "../../../shared/context";
import { FakeClock, InMemoryAuditRepository, InMemoryMembershipRepository } from "../../../testing/fakes";
import { InMemoryEventRepository, InMemorySalesBatchRepository } from "../../../testing/fakes-events";
import { InMemoryOrderRepository, InMemoryReservationStore } from "../../../testing/fakes-sales";
import {
  InMemoryCommissionEntryRepository,
  InMemoryCommissionRuleRepository,
  InMemoryCouponRepository,
  InMemoryOrderAttributionRepository,
  InMemoryPromoterAssignmentRepository,
  InMemoryPromoterLinkRepository,
} from "../../../testing/fakes-promoters";
import { OrdersService } from "../../orders/service";
import { PromotersService } from "../service";

const ORG = "org_a";
const OTHER_ORG = "org_b";

async function setup() {
  const clock = new FakeClock(new Date("2026-07-18T12:00:00Z"));
  const audit = new InMemoryAuditRepository();
  const memberships = new InMemoryMembershipRepository();
  const events = new InMemoryEventRepository();
  const batches = new InMemorySalesBatchRepository();
  const reservations = new InMemoryReservationStore(batches);
  const orders = new InMemoryOrderRepository(reservations);

  const assignments = new InMemoryPromoterAssignmentRepository();
  const links = new InMemoryPromoterLinkRepository();
  const coupons = new InMemoryCouponRepository();
  const rules = new InMemoryCommissionRuleRepository();
  const attributions = new InMemoryOrderAttributionRepository();
  const entries = new InMemoryCommissionEntryRepository();

  const manager = await memberships.create({ organizationId: ORG, userId: "u_mgr", role: "OWNER" });
  const promoter = await memberships.create({
    organizationId: ORG,
    userId: "u_promo",
    role: "PROMOTER",
  });
  const promoter2 = await memberships.create({
    organizationId: ORG,
    userId: "u_promo2",
    role: "PROMOTER",
  });

  const event = await events.create({
    organizationId: ORG,
    title: "Show",
    slug: "show",
    timezone: "America/Sao_Paulo",
  });
  event.status = "PUBLISHED";

  const ticketType = { id: "tt_full" };
  const batch = await batches.create({
    organizationId: ORG,
    eventId: event.id,
    ticketTypeId: ticketType.id,
    name: "Lote 1",
    priceCents: 10_000,
    quantityTotal: 100,
  });
  batch.status = "OPEN";

  const promoters = new PromotersService({
    assignments,
    links,
    coupons,
    rules,
    attributions,
    entries,
    memberships,
    events,
    orders,
    audit,
    clock,
  });

  const managerCtx: RequestContext = {
    organizationId: ORG,
    userId: "u_mgr",
    role: "member",
    correlationId: "corr",
  };
  const promoterCtx: RequestContext = {
    organizationId: ORG,
    userId: "u_promo",
    role: "member",
    correlationId: "corr",
  };

  return {
    clock,
    audit,
    memberships,
    events,
    batches,
    reservations,
    orders,
    assignments,
    links,
    coupons,
    rules,
    attributions,
    entries,
    promoters,
    manager,
    promoter,
    promoter2,
    event,
    batch,
    ticketType,
    managerCtx,
    promoterCtx,
  };
}

describe("PromotersService — authorization & tenancy", () => {
  it("blocks a non-manager (promoter role) from managing promoters", async () => {
    const s = await setup();
    await expect(
      s.promoters.assignPromoter(s.promoterCtx, s.event.id, { membershipId: s.promoter.id }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });

  it("blocks a caller with no membership", async () => {
    const s = await setup();
    const stranger: RequestContext = {
      organizationId: ORG,
      userId: "nobody",
      role: "member",
      correlationId: "c",
    };
    await expect(s.promoters.listPromoters(stranger, s.event.id)).rejects.toBeInstanceOf(
      NotFoundOrForbiddenError,
    );
  });

  it("org B manager cannot touch org A's event (generic 404)", async () => {
    const s = await setup();
    await s.memberships.create({ organizationId: OTHER_ORG, userId: "u_b", role: "OWNER" });
    const ctxB: RequestContext = {
      organizationId: OTHER_ORG,
      userId: "u_b",
      role: "member",
      correlationId: "c",
    };
    await expect(
      s.promoters.assignPromoter(ctxB, s.event.id, { membershipId: s.promoter.id }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });

  it("rejects assigning a membership that is not a PROMOTER", async () => {
    const s = await setup();
    await expect(
      s.promoters.assignPromoter(s.managerCtx, s.event.id, { membershipId: s.manager.id }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe("coupons & links management", () => {
  it("requires the promoter to be assigned before owning a coupon/link", async () => {
    const s = await setup();
    await expect(
      s.promoters.createLink(s.managerCtx, s.event.id, { membershipId: s.promoter.id }),
    ).rejects.toBeInstanceOf(ValidationFailedError);

    await s.promoters.assignPromoter(s.managerCtx, s.event.id, { membershipId: s.promoter.id });
    const link = await s.promoters.createLink(s.managerCtx, s.event.id, {
      membershipId: s.promoter.id,
    });
    expect(link.code).toHaveLength(8);
    // Idempotent: same promoter+event returns the same link
    const again = await s.promoters.createLink(s.managerCtx, s.event.id, {
      membershipId: s.promoter.id,
    });
    expect(again.id).toBe(link.id);
  });

  it("rejects duplicate coupon codes within an event", async () => {
    const s = await setup();
    await s.promoters.createCoupon(s.managerCtx, s.event.id, {
      code: "SAVE10",
      type: "PERCENT",
      value: 1000,
    });
    await expect(
      s.promoters.createCoupon(s.managerCtx, s.event.id, {
        code: "save10",
        type: "PERCENT",
        value: 2000,
      }),
    ).rejects.toThrow();
  });
});

describe("resolveDiscount (checkout, server-side)", () => {
  it("returns the discount for a valid coupon", async () => {
    const s = await setup();
    const coupon = await s.promoters.createCoupon(s.managerCtx, s.event.id, {
      code: "SAVE20",
      type: "PERCENT",
      value: 2000,
    });
    const result = await s.promoters.resolveDiscount({
      organizationId: ORG,
      eventId: s.event.id,
      couponCode: "save20",
      subtotalCents: 10_000,
      now: s.clock.now(),
    });
    expect(result.couponId).toBe(coupon.id);
    expect(result.discountCents).toBe(2_000);
  });

  it("rejects an invalid coupon so the buyer never pays a surprise price", async () => {
    const s = await setup();
    await expect(
      s.promoters.resolveDiscount({
        organizationId: ORG,
        eventId: s.event.id,
        couponCode: "GHOST",
        subtotalCents: 10_000,
        now: s.clock.now(),
      }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe("recordAttribution — priority (BR-PRM-002)", () => {
  async function assignBoth(s: Awaited<ReturnType<typeof setup>>) {
    await s.promoters.assignPromoter(s.managerCtx, s.event.id, { membershipId: s.promoter.id });
    await s.promoters.assignPromoter(s.managerCtx, s.event.id, { membershipId: s.promoter2.id });
  }

  it("a promoter-owned coupon wins over a link to another promoter", async () => {
    const s = await setup();
    await assignBoth(s);
    await s.promoters.createCoupon(s.managerCtx, s.event.id, {
      code: "PROMO1",
      type: "PERCENT",
      value: 1000,
      membershipId: s.promoter.id,
    });
    const link = await s.promoters.createLink(s.managerCtx, s.event.id, {
      membershipId: s.promoter2.id,
    });

    await s.promoters.recordAttribution({
      organizationId: ORG,
      eventId: s.event.id,
      orderId: "order_1",
      couponCode: "promo1",
      linkRef: link.code,
      now: s.clock.now(),
    });

    const att = await s.attributions.findByOrder(ORG, "order_1");
    expect(att?.mechanism).toBe("COUPON");
    expect(att?.membershipId).toBe(s.promoter.id);
  });

  it("falls back to the link when the coupon has no promoter", async () => {
    const s = await setup();
    await assignBoth(s);
    await s.promoters.createCoupon(s.managerCtx, s.event.id, {
      code: "OPEN10",
      type: "PERCENT",
      value: 1000,
    });
    const link = await s.promoters.createLink(s.managerCtx, s.event.id, {
      membershipId: s.promoter2.id,
    });

    await s.promoters.recordAttribution({
      organizationId: ORG,
      eventId: s.event.id,
      orderId: "order_2",
      couponCode: "open10",
      linkRef: link.code,
      now: s.clock.now(),
    });

    const att = await s.attributions.findByOrder(ORG, "order_2");
    expect(att?.membershipId).toBe(s.promoter2.id);
    expect(att?.linkId).toBe(link.id);
  });

  it("captures UTM params and no promoter when nothing matches", async () => {
    const s = await setup();
    await s.promoters.recordAttribution({
      organizationId: ORG,
      eventId: s.event.id,
      orderId: "order_3",
      utm: { source: "instagram", campaign: "verao" },
      now: s.clock.now(),
    });
    const att = await s.attributions.findByOrder(ORG, "order_3");
    expect(att?.mechanism).toBe("NONE");
    expect(att?.membershipId).toBeNull();
    expect(att?.utmSource).toBe("instagram");
  });
});

describe("commission accrual & reversal (FR-PRM-010/011)", () => {
  async function paidAttributedOrder(
    s: Awaited<ReturnType<typeof setup>>,
    opts?: { couponId?: string },
  ) {
    await s.promoters.assignPromoter(s.managerCtx, s.event.id, { membershipId: s.promoter.id });
    await s.promoters.createCommissionRule(s.managerCtx, s.event.id, {
      type: "PERCENT",
      value: 1000, // 10%
    });
    const order = await s.orders.createPendingOrder({
      organizationId: ORG,
      eventId: s.event.id,
      code: "CODE1",
      buyerName: "Buyer",
      buyerEmail: "b@x.com",
      subtotalCents: 20_000,
      discountCents: 0,
      totalCents: 20_000,
      expiresAt: new Date(s.clock.now().getTime() + 900_000),
      correlationId: "c",
      units: [
        { batchId: s.batch.id, ticketTypeId: s.ticketType.id, unitPriceCents: 10_000 },
        { batchId: s.batch.id, ticketTypeId: s.ticketType.id, unitPriceCents: 10_000 },
      ],
    });
    await s.orders.transitionStatus(ORG, order.id, ["AWAITING_PAYMENT"], "PAID");
    await s.attributions.upsert({
      organizationId: ORG,
      orderId: order.id,
      eventId: s.event.id,
      mechanism: "LINK",
      membershipId: s.promoter.id,
      couponId: opts?.couponId,
    });
    return order;
  }

  it("accrues 10% of the paid order to the attributed promoter, once", async () => {
    const s = await setup();
    const order = await paidAttributedOrder(s);

    await s.promoters.accrueForPaidOrder(ORG, order.id, { correlationId: "c" });
    await s.promoters.accrueForPaidOrder(ORG, order.id, { correlationId: "c" }); // retry

    const accruals = s.entries.entries.filter((e) => e.type === "ACCRUAL");
    expect(accruals).toHaveLength(1);
    expect(accruals[0]!.amountCents).toBe(2_000);
    expect(accruals[0]!.membershipId).toBe(s.promoter.id);
  });

  it("does not accrue for an order that is not PAID", async () => {
    const s = await setup();
    await s.promoters.assignPromoter(s.managerCtx, s.event.id, { membershipId: s.promoter.id });
    await s.promoters.createCommissionRule(s.managerCtx, s.event.id, { type: "PERCENT", value: 1000 });
    const order = await s.orders.createPendingOrder({
      organizationId: ORG,
      eventId: s.event.id,
      code: "CODE2",
      buyerName: "B",
      buyerEmail: "b@x.com",
      subtotalCents: 10_000,
      discountCents: 0,
      totalCents: 10_000,
      expiresAt: new Date(s.clock.now().getTime() + 900_000),
      correlationId: "c",
      units: [{ batchId: s.batch.id, ticketTypeId: s.ticketType.id, unitPriceCents: 10_000 }],
    });
    await s.attributions.upsert({
      organizationId: ORG,
      orderId: order.id,
      eventId: s.event.id,
      mechanism: "LINK",
      membershipId: s.promoter.id,
    });
    await s.promoters.accrueForPaidOrder(ORG, order.id, { correlationId: "c" });
    expect(s.entries.entries).toHaveLength(0);
  });

  it("counts a coupon redemption exactly once on accrual", async () => {
    const s = await setup();
    await s.promoters.assignPromoter(s.managerCtx, s.event.id, { membershipId: s.promoter.id });
    const coupon = await s.promoters.createCoupon(s.managerCtx, s.event.id, {
      code: "LIM",
      type: "FIXED",
      value: 500,
      membershipId: s.promoter.id,
      maxRedemptions: 1,
    });
    const order = await paidAttributedOrder(s, { couponId: coupon.id });

    await s.promoters.accrueForPaidOrder(ORG, order.id, { correlationId: "c" });
    await s.promoters.accrueForPaidOrder(ORG, order.id, { correlationId: "c" });

    const stored = s.coupons.coupons.find((c) => c.id === coupon.id);
    expect(stored?.redemptions).toBe(1);
  });

  it("reversal posts a compensating entry; net commission returns to zero", async () => {
    const s = await setup();
    const order = await paidAttributedOrder(s);
    await s.promoters.accrueForPaidOrder(ORG, order.id, { correlationId: "c" });

    await s.promoters.reverseForOrder(ORG, order.id, { correlationId: "c" });
    await s.promoters.reverseForOrder(ORG, order.id, { correlationId: "c" }); // idempotent

    const reversals = s.entries.entries.filter((e) => e.type === "REVERSAL");
    expect(reversals).toHaveLength(1);
    const summary = await s.entries.summaryForPromoter(ORG, s.promoter.id);
    expect(summary.amountCents).toBe(0);
    expect(summary.quantity).toBe(0);
  });

  it("does nothing when there is no attribution", async () => {
    const s = await setup();
    const order = await s.orders.createPendingOrder({
      organizationId: ORG,
      eventId: s.event.id,
      code: "CODE3",
      buyerName: "B",
      buyerEmail: "b@x.com",
      subtotalCents: 10_000,
      discountCents: 0,
      totalCents: 10_000,
      expiresAt: new Date(s.clock.now().getTime() + 900_000),
      correlationId: "c",
      units: [{ batchId: s.batch.id, ticketTypeId: s.ticketType.id, unitPriceCents: 10_000 }],
    });
    await s.orders.transitionStatus(ORG, order.id, ["AWAITING_PAYMENT"], "PAID");
    await s.promoters.accrueForPaidOrder(ORG, order.id, { correlationId: "c" });
    expect(s.entries.entries).toHaveLength(0);
  });
});

describe("promoter self-view (FR-PRM-012, BR-PRV-003)", () => {
  it("a promoter sees only their own commission summary", async () => {
    const s = await setup();
    const summary = await s.promoters.myCommissionSummary(s.promoterCtx);
    expect(summary.membershipId).toBe(s.promoter.id);
  });

  it("a manager (non-promoter) cannot use the promoter self-view", async () => {
    const s = await setup();
    await expect(s.promoters.myCommissionSummary(s.managerCtx)).rejects.toBeInstanceOf(
      NotFoundOrForbiddenError,
    );
  });
});

describe("OrdersService integration — discount + attribution", () => {
  it("applies the coupon discount to the order total and records attribution", async () => {
    const s = await setup();
    await s.promoters.assignPromoter(s.managerCtx, s.event.id, { membershipId: s.promoter.id });
    await s.promoters.createCoupon(s.managerCtx, s.event.id, {
      code: "TEN",
      type: "PERCENT",
      value: 1000,
      membershipId: s.promoter.id,
    });

    const publicEvents = {
      findPublishedById: async (eventId: string) =>
        s.events.events.find((e) => e.id === eventId && e.status === "PUBLISHED") ?? null,
    };
    const ordersService = new OrdersService({
      orders: s.orders,
      reservations: s.reservations,
      publicEvents,
      batches: s.batches,
      audit: s.audit,
      clock: s.clock,
      checkout: s.promoters,
    });

    const { order } = await ordersService.createOrder(
      {
        eventId: s.event.id,
        items: [{ batchId: s.batch.id, quantity: 2 }],
        buyer: { name: "Buyer", email: "buyer@x.com" },
        coupon: "ten",
      },
      { correlationId: "c" },
    );

    expect(order.subtotalCents).toBe(20_000);
    expect(order.discountCents).toBe(2_000);
    expect(order.totalCents).toBe(18_000);

    const att = await s.attributions.findByOrder(ORG, order.id);
    expect(att?.membershipId).toBe(s.promoter.id);
  });

  it("rejects the whole checkout when the coupon is invalid", async () => {
    const s = await setup();
    const publicEvents = {
      findPublishedById: async (eventId: string) =>
        s.events.events.find((e) => e.id === eventId && e.status === "PUBLISHED") ?? null,
    };
    const ordersService = new OrdersService({
      orders: s.orders,
      reservations: s.reservations,
      publicEvents,
      batches: s.batches,
      audit: s.audit,
      clock: s.clock,
      checkout: s.promoters,
    });

    await expect(
      ordersService.createOrder(
        {
          eventId: s.event.id,
          items: [{ batchId: s.batch.id, quantity: 1 }],
          buyer: { name: "Buyer", email: "buyer@x.com" },
          coupon: "NOPE",
        },
        { correlationId: "c" },
      ),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });
});
