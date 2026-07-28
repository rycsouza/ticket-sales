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
  InMemoryPromoterRepository,
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

  const promotersRepo = new InMemoryPromoterRepository();
  const assignments = new InMemoryPromoterAssignmentRepository();
  const links = new InMemoryPromoterLinkRepository();
  const coupons = new InMemoryCouponRepository();
  const rules = new InMemoryCommissionRuleRepository();
  const attributions = new InMemoryOrderAttributionRepository();
  const entries = new InMemoryCommissionEntryRepository();

  const manager = await memberships.create({ organizationId: ORG, userId: "u_mgr", role: "OWNER" });
  const promoMembership = await memberships.create({
    organizationId: ORG,
    userId: "u_promo",
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
    promoters: promotersRepo,
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

  // Two org-level promoters; the first is linked to the promoter login account.
  const { promoter, reportToken } = await promoters.createPromoter(managerCtx, {
    name: "Promo Um",
    contactEmail: "um@promo.com",
  });
  await promoters.promoteToLogin(managerCtx, promoter.id, { membershipId: promoMembership.id });
  const { promoter: promoter2 } = await promoters.createPromoter(managerCtx, { name: "Promo Dois" });

  return {
    clock,
    audit,
    memberships,
    events,
    batches,
    reservations,
    orders,
    promotersRepo,
    assignments,
    links,
    coupons,
    rules,
    attributions,
    entries,
    promoters,
    manager,
    promoMembership,
    promoter,
    promoter2,
    reportToken,
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
      s.promoters.linkPromoterToEvent(s.promoterCtx, s.event.id, { promoterId: s.promoter.id }),
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
    await expect(s.promoters.listPromoters(stranger)).rejects.toBeInstanceOf(
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
      s.promoters.linkPromoterToEvent(ctxB, s.event.id, { promoterId: s.promoter.id }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });

  it("cannot link a promoter from another organization (generic 404)", async () => {
    const s = await setup();
    await expect(
      s.promoters.linkPromoterToEvent(s.managerCtx, s.event.id, { promoterId: "prm_ghost" }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });

  it("rejects promoting to a membership that is not a PROMOTER", async () => {
    const s = await setup();
    await expect(
      s.promoters.promoteToLogin(s.managerCtx, s.promoter2.id, { membershipId: s.manager.id }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe("coupons & links management", () => {
  it("requires the promoter to be assigned before owning a coupon/link", async () => {
    const s = await setup();
    await expect(
      s.promoters.createLink(s.managerCtx, s.event.id, { promoterId: s.promoter.id }),
    ).rejects.toBeInstanceOf(ValidationFailedError);

    await s.promoters.linkPromoterToEvent(s.managerCtx, s.event.id, { promoterId: s.promoter.id });
    const link = await s.promoters.createLink(s.managerCtx, s.event.id, {
      promoterId: s.promoter.id,
    });
    expect(link.code).toHaveLength(8);
    // Idempotent: same promoter+event returns the same link
    const again = await s.promoters.createLink(s.managerCtx, s.event.id, {
      promoterId: s.promoter.id,
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

describe("org-level (default) coupons & rules — hierarchy affiliate > event > org", () => {
  it("an org-default coupon resolves for any event; an event coupon shadows it", async () => {
    const s = await setup();
    // Org-wide default coupon (eventId null).
    await s.promoters.createCoupon(s.managerCtx, null, { code: "GERAL", type: "PERCENT", value: 1000 });
    const viaDefault = await s.promoters.resolveDiscount({
      organizationId: ORG,
      eventId: s.event.id,
      couponCode: "geral",
      subtotalCents: 10_000,
      now: s.clock.now(),
    });
    expect(viaDefault.discountCents).toBe(1_000);

    // Same code, but event-scoped with a bigger discount → shadows the default.
    await s.promoters.createCoupon(s.managerCtx, s.event.id, {
      code: "GERAL",
      type: "PERCENT",
      value: 3000,
    });
    const viaEvent = await s.promoters.resolveDiscount({
      organizationId: ORG,
      eventId: s.event.id,
      couponCode: "geral",
      subtotalCents: 10_000,
      now: s.clock.now(),
    });
    expect(viaEvent.discountCents).toBe(3_000);
  });

  it("an org-default commission rule accrues; an event-specific rule overrides it", async () => {
    const s = await setup();
    await s.promoters.linkPromoterToEvent(s.managerCtx, s.event.id, { promoterId: s.promoter.id });
    // Org default 10%.
    await s.promoters.createCommissionRule(s.managerCtx, null, { type: "PERCENT", value: 1000 });
    // Event-specific 20% (should win for this event).
    await s.promoters.createCommissionRule(s.managerCtx, s.event.id, { type: "PERCENT", value: 2000 });

    const active = await s.rules.listActiveByEvent(ORG, s.event.id);
    expect(active).toHaveLength(2); // default + event
    const order = await paidOrder(s, s.promoter.id);
    await s.promoters.accrueForPaidOrder(ORG, order.id, { correlationId: "c" });
    const accrual = s.entries.entries.find((e) => e.type === "ACCRUAL");
    expect(accrual?.amountCents).toBe(4_000); // 20% of 20000, event rule wins
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
    await s.promoters.linkPromoterToEvent(s.managerCtx, s.event.id, { promoterId: s.promoter.id });
    await s.promoters.linkPromoterToEvent(s.managerCtx, s.event.id, { promoterId: s.promoter2.id });
  }

  it("a promoter-owned coupon wins over a link to another promoter", async () => {
    const s = await setup();
    await assignBoth(s);
    await s.promoters.createCoupon(s.managerCtx, s.event.id, {
      code: "PROMO1",
      type: "PERCENT",
      value: 1000,
      promoterId: s.promoter.id,
    });
    const link = await s.promoters.createLink(s.managerCtx, s.event.id, {
      promoterId: s.promoter2.id,
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
    expect(att?.promoterId).toBe(s.promoter.id);
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
      promoterId: s.promoter2.id,
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
    expect(att?.promoterId).toBe(s.promoter2.id);
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
    expect(att?.promoterId).toBeNull();
    expect(att?.utmSource).toBe("instagram");
  });
});

/** Helper: a PAID order attributed to `promoterId` with a 20000 subtotal (2 units). */
async function paidOrder(s: Awaited<ReturnType<typeof setup>>, promoterId: string, couponId?: string) {
  const order = await s.orders.createPendingOrder({
    organizationId: ORG,
    eventId: s.event.id,
    code: `CODE_${promoterId}_${Math.floor(s.clock.now().getTime())}`,
    buyerName: "Buyer",
    buyerEmail: "b@x.com",
    subtotalCents: 20_000,
    discountCents: 0,
    feeCents: 0,
    feeMode: "PRODUCER",
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
    promoterId,
    couponId,
  });
  return order;
}

describe("commission accrual & reversal (FR-PRM-010/011)", () => {
  async function paidAttributedOrder(
    s: Awaited<ReturnType<typeof setup>>,
    opts?: { couponId?: string },
  ) {
    await s.promoters.linkPromoterToEvent(s.managerCtx, s.event.id, { promoterId: s.promoter.id });
    await s.promoters.createCommissionRule(s.managerCtx, s.event.id, { type: "PERCENT", value: 1000 });
    return paidOrder(s, s.promoter.id, opts?.couponId);
  }

  it("accrues 10% of the paid order to the attributed promoter, once", async () => {
    const s = await setup();
    const order = await paidAttributedOrder(s);

    await s.promoters.accrueForPaidOrder(ORG, order.id, { correlationId: "c" });
    await s.promoters.accrueForPaidOrder(ORG, order.id, { correlationId: "c" }); // retry

    const accruals = s.entries.entries.filter((e) => e.type === "ACCRUAL");
    expect(accruals).toHaveLength(1);
    expect(accruals[0]!.amountCents).toBe(2_000);
    expect(accruals[0]!.promoterId).toBe(s.promoter.id);
  });

  it("counts a coupon redemption exactly once on accrual", async () => {
    const s = await setup();
    await s.promoters.linkPromoterToEvent(s.managerCtx, s.event.id, { promoterId: s.promoter.id });
    const coupon = await s.promoters.createCoupon(s.managerCtx, s.event.id, {
      code: "LIM",
      type: "FIXED",
      value: 500,
      promoterId: s.promoter.id,
      maxRedemptions: 1,
    });
    await s.promoters.createCommissionRule(s.managerCtx, s.event.id, { type: "PERCENT", value: 1000 });
    const order = await paidOrder(s, s.promoter.id, coupon.id);

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
      feeCents: 0,
      feeMode: "PRODUCER",
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

describe("promoter report (FR-PRM-012/013, BR-PRV-003)", () => {
  it("a linked promoter sees only their own report via the panel", async () => {
    const s = await setup();
    const report = await s.promoters.myReport(s.promoterCtx);
    expect(report.promoter.id).toBe(s.promoter.id);
  });

  it("a manager (non-promoter) cannot use the promoter self-view", async () => {
    const s = await setup();
    await expect(s.promoters.myReport(s.managerCtx)).rejects.toBeInstanceOf(
      NotFoundOrForbiddenError,
    );
  });

  it("the tokenized public report resolves the owning promoter; a wrong token leaks nothing", async () => {
    const s = await setup();
    const report = await s.promoters.getPromoterReportByToken(s.reportToken);
    expect(report?.promoter.id).toBe(s.promoter.id);
    expect(await s.promoters.getPromoterReportByToken("wrong-token-value-1234567890")).toBeNull();
  });

  it("regenerating the token invalidates the previous link", async () => {
    const s = await setup();
    const fresh = await s.promoters.regenerateReportToken(s.managerCtx, s.promoter.id);
    expect(await s.promoters.getPromoterReportByToken(s.reportToken)).toBeNull();
    expect((await s.promoters.getPromoterReportByToken(fresh))?.promoter.id).toBe(s.promoter.id);
  });
});

describe("OrdersService integration — discount + attribution", () => {
  it("applies the coupon discount to the order total and records attribution", async () => {
    const s = await setup();
    await s.promoters.linkPromoterToEvent(s.managerCtx, s.event.id, { promoterId: s.promoter.id });
    await s.promoters.createCoupon(s.managerCtx, s.event.id, {
      code: "TEN",
      type: "PERCENT",
      value: 1000,
      promoterId: s.promoter.id,
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
    expect(att?.promoterId).toBe(s.promoter.id);
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

describe("PromotersService.eventHasCoupons — checkout gate", () => {
  it("is false with no coupons, true once an active coupon exists", async () => {
    const s = await setup();
    expect(await s.promoters.eventHasCoupons(ORG, s.event.id)).toBe(false);

    await s.promoters.createCoupon(s.managerCtx, s.event.id, {
      code: "PROMO10",
      type: "PERCENT",
      value: 1000,
    });
    expect(await s.promoters.eventHasCoupons(ORG, s.event.id)).toBe(true);
  });

  it("counts an org-wide default coupon (null eventId) for the event", async () => {
    const s = await setup();
    await s.coupons.create({ organizationId: ORG, eventId: null, code: "GERAL", type: "FIXED", value: 500 });
    expect(await s.promoters.eventHasCoupons(ORG, s.event.id)).toBe(true);
  });

  it("ignores inactive, expired and other-org coupons", async () => {
    const s = await setup();
    const now = s.clock.now();
    await s.coupons.create({
      organizationId: ORG,
      eventId: s.event.id,
      code: "OFF",
      type: "PERCENT",
      value: 1000,
    });
    // Deactivate it.
    s.coupons.coupons[0]!.active = false;
    expect(await s.promoters.eventHasCoupons(ORG, s.event.id)).toBe(false);

    await s.coupons.create({
      organizationId: ORG,
      eventId: s.event.id,
      code: "EXPIRED",
      type: "PERCENT",
      value: 1000,
      endsAt: new Date(now.getTime() - 1000),
    });
    expect(await s.promoters.eventHasCoupons(ORG, s.event.id)).toBe(false);

    await s.coupons.create({
      organizationId: OTHER_ORG,
      eventId: s.event.id,
      code: "OTHERORG",
      type: "PERCENT",
      value: 1000,
    });
    expect(await s.promoters.eventHasCoupons(ORG, s.event.id)).toBe(false);
  });
});
