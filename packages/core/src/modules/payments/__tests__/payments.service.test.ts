import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundOrForbiddenError } from "../../../shared/errors";
import { FakeClock, InMemoryAuditRepository } from "../../../testing/fakes";
import {
  InMemoryEventRepository,
  InMemorySalesBatchRepository,
  InMemoryTicketTypeRepository,
} from "../../../testing/fakes-events";
import {
  FakePsp,
  InMemoryOrderRepository,
  InMemoryPaymentEventRepository,
  InMemoryPaymentRepository,
  InMemoryReservationStore,
} from "../../../testing/fakes-sales";
import { OrdersService } from "../../orders/service";
import { PaymentsService } from "../service";
import type { EventRecord } from "../../events/types";

const ORG = "org_pay";

async function setup() {
  const clock = new FakeClock();
  const audit = new InMemoryAuditRepository();
  const events = new InMemoryEventRepository();
  const ticketTypes = new InMemoryTicketTypeRepository();
  const batches = new InMemorySalesBatchRepository();
  const reservations = new InMemoryReservationStore(batches);
  const orders = new InMemoryOrderRepository(reservations);
  const payments = new InMemoryPaymentRepository();
  const paymentEvents = new InMemoryPaymentEventRepository();
  const psp = new FakePsp();

  const event = await events.create({
    organizationId: ORG,
    title: "Show",
    slug: "show",
    timezone: "America/Sao_Paulo",
    capacityTotal: 100,
  });
  event.status = "PUBLISHED";
  const ticketType = await ticketTypes.create({
    organizationId: ORG,
    eventId: event.id,
    name: "Inteira",
    kind: "FULL",
  });
  const batch = await batches.create({
    organizationId: ORG,
    eventId: event.id,
    ticketTypeId: ticketType.id,
    name: "Lote 1",
    priceCents: 10_000,
    quantityTotal: 50,
  });
  batch.status = "OPEN";

  const publicEvents = {
    findPublishedById: async (eventId: string): Promise<EventRecord | null> =>
      events.events.find((e) => e.id === eventId && e.status === "PUBLISHED") ?? null,
  };
  const ordersService = new OrdersService({
    orders,
    reservations,
    publicEvents,
    batches,
    audit,
    clock,
  });

  const fulfillments: string[] = [];
  const service = new PaymentsService({
    payments,
    paymentEvents,
    orders,
    orderCoordinator: ordersService,
    fulfiller: {
      fulfill: async (_org, orderId) => {
        fulfillments.push(orderId);
      },
    },
    psp,
    audit,
    clock,
  });

  const { order } = await ordersService.createOrder(
    {
      eventId: event.id,
      items: [{ batchId: batch.id, quantity: 2 }],
      buyer: { name: "Maria", email: "maria@teste.com" },
    },
    { correlationId: "c" },
  );

  return {
    clock,
    audit,
    orders,
    payments,
    paymentEvents,
    psp,
    batch,
    order,
    service,
    ordersService,
    fulfillments,
  };
}

const meta = { correlationId: "corr" };

describe("createPixChargeForOrder", () => {
  it("creates a CREATED payment with Pix data, expiry aligned to the order", async () => {
    const env = await setup();

    const payment = await env.service.createPixChargeForOrder(
      env.order.code,
      "maria@teste.com",
      meta,
    );

    expect(payment.status).toBe("CREATED");
    expect(payment.amountCents).toBe(20_000);
    expect(payment.pixQrCodeText).toContain("pix");
    expect(payment.expiresAt?.getTime()).toBe(env.order.expiresAt?.getTime());
    expect(env.psp.pixCalls[0]?.amount).toBe(20_000);
  });

  it("reuses the pending charge — refresh never duplicates (FR-CHK-016)", async () => {
    const env = await setup();

    const first = await env.service.createPixChargeForOrder(
      env.order.code,
      "maria@teste.com",
      meta,
    );
    const second = await env.service.createPixChargeForOrder(
      env.order.code,
      "maria@teste.com",
      meta,
    );

    expect(second.id).toBe(first.id);
    expect(env.psp.pixCalls).toHaveLength(1);
  });

  it("allows a NEW charge after the previous was rejected", async () => {
    const env = await setup();
    const first = await env.service.createPixChargeForOrder(
      env.order.code,
      "maria@teste.com",
      meta,
    );
    await env.payments.transitionStatus(first.id, ["CREATED"], "REJECTED");

    const second = await env.service.createPixChargeForOrder(
      env.order.code,
      "maria@teste.com",
      meta,
    );
    expect(second.id).not.toBe(first.id);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("rejects wrong e-mail with the generic error (anti-enumeration)", async () => {
    const env = await setup();
    await expect(
      env.service.createPixChargeForOrder(env.order.code, "intruso@x.com", meta),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });

  it("rejects an expired order", async () => {
    const env = await setup();
    env.clock.advance(16 * 60 * 1000);
    await expect(
      env.service.createPixChargeForOrder(env.order.code, "maria@teste.com", meta),
    ).rejects.toThrow(ConflictError);
  });
});

describe("processWebhook — approval flow", () => {
  it("approves payment, marks order paid, fulfills exactly once", async () => {
    const env = await setup();
    const payment = await env.service.createPixChargeForOrder(
      env.order.code,
      "maria@teste.com",
      meta,
    );

    env.psp.nextWebhookEvent = {
      providerEventId: "evt_1",
      providerTransactionId: payment.providerTransactionId as string,
      type: "payment.approved",
      occurredAt: env.clock.now(),
    };

    const outcome = await env.service.processWebhook({ headers: {}, rawBody: "{}" }, meta);

    expect(outcome).toEqual({ outcome: "processed", type: "payment.approved" });
    expect(env.payments.payments[0]?.status).toBe("APPROVED");
    expect(env.orders.orders[0]?.status).toBe("PAID");
    expect(env.batch.quantitySold).toBe(2);
    expect(env.fulfillments).toEqual([env.order.id]);
  });

  it("duplicated event is a no-op (FR-PAY-007)", async () => {
    const env = await setup();
    const payment = await env.service.createPixChargeForOrder(
      env.order.code,
      "maria@teste.com",
      meta,
    );
    env.psp.nextWebhookEvent = {
      providerEventId: "evt_dup",
      providerTransactionId: payment.providerTransactionId as string,
      type: "payment.approved",
      occurredAt: env.clock.now(),
    };

    await env.service.processWebhook({ headers: {}, rawBody: "{}" }, meta);
    const second = await env.service.processWebhook({ headers: {}, rawBody: "{}" }, meta);

    expect(second).toEqual({ outcome: "duplicate" });
    expect(env.fulfillments).toHaveLength(1);
    expect(env.batch.quantitySold).toBe(2); // counters untouched
  });

  it("a FAILED event can be reprocessed and heals (crash between steps)", async () => {
    const env = await setup();
    const payment = await env.service.createPixChargeForOrder(
      env.order.code,
      "maria@teste.com",
      meta,
    );
    env.psp.nextWebhookEvent = {
      providerEventId: "evt_crash",
      providerTransactionId: payment.providerTransactionId as string,
      type: "payment.approved",
      occurredAt: env.clock.now(),
    };

    // First delivery: fulfiller explodes AFTER payment/order transitions
    const originalFulfill = env.fulfillments;
    let shouldFail = true;
    const failingService = new PaymentsService({
      payments: env.payments,
      paymentEvents: env.paymentEvents,
      orders: env.orders,
      orderCoordinator: env.ordersService,
      fulfiller: {
        fulfill: async (_org, orderId) => {
          if (shouldFail) throw new Error("mailer down");
          originalFulfill.push(orderId);
        },
      },
      psp: env.psp,
      audit: env.audit,
      clock: env.clock,
    });

    await expect(
      failingService.processWebhook({ headers: {}, rawBody: "{}" }, meta),
    ).rejects.toThrow("mailer down");
    expect(env.paymentEvents.events[0]?.status).toBe("FAILED");

    // Provider retry: event is claimed again, fulfillment completes
    shouldFail = false;
    const retry = await failingService.processWebhook({ headers: {}, rawBody: "{}" }, meta);
    expect(retry).toEqual({ outcome: "processed", type: "payment.approved" });
    expect(env.fulfillments).toEqual([env.order.id]);
    expect(env.batch.quantitySold).toBe(2); // confirm ran once — idempotent
  });

  it("rejected event moves only the payment; buyer can retry", async () => {
    const env = await setup();
    const payment = await env.service.createPixChargeForOrder(
      env.order.code,
      "maria@teste.com",
      meta,
    );
    env.psp.nextWebhookEvent = {
      providerEventId: "evt_rej",
      providerTransactionId: payment.providerTransactionId as string,
      type: "payment.rejected",
      occurredAt: env.clock.now(),
    };

    await env.service.processWebhook({ headers: {}, rawBody: "{}" }, meta);

    expect(env.payments.payments[0]?.status).toBe("REJECTED");
    expect(env.orders.orders[0]?.status).toBe("AWAITING_PAYMENT");
    expect(env.fulfillments).toHaveLength(0);
  });

  it("unknown transaction fails the event (reconciliation queue)", async () => {
    const env = await setup();
    env.psp.nextWebhookEvent = {
      providerEventId: "evt_ghost",
      providerTransactionId: "mp_desconhecida",
      type: "payment.approved",
      occurredAt: env.clock.now(),
    };

    await expect(
      env.service.processWebhook({ headers: {}, rawBody: "{}" }, meta),
    ).rejects.toThrow();
    expect(env.paymentEvents.events[0]?.status).toBe("FAILED");
  });

  it("unverifiable webhook is ignored without side effects", async () => {
    const env = await setup();
    env.psp.nextWebhookEvent = null;

    const outcome = await env.service.processWebhook(
      { headers: {}, rawBody: "malicious" },
      meta,
    );
    expect(outcome).toEqual({ outcome: "ignored" });
    expect(env.paymentEvents.events).toHaveLength(0);
  });
});
