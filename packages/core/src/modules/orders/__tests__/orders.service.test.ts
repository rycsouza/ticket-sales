import { describe, expect, it } from "vitest";
import {
  ConflictError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../../shared/errors";
import { FakeClock, InMemoryAuditRepository } from "../../../testing/fakes";
import {
  InMemoryEventRepository,
  InMemorySalesBatchRepository,
  InMemoryTicketTypeRepository,
} from "../../../testing/fakes-events";
import { InMemoryOrderRepository, InMemoryReservationStore } from "../../../testing/fakes-sales";
import { OrdersService } from "../service";
import type { EventRecord } from "../../events/types";

const ORG = "org_sales";

async function setup(options?: { capacity?: number; batchQty?: number }) {
  const clock = new FakeClock();
  const audit = new InMemoryAuditRepository();
  const events = new InMemoryEventRepository();
  const ticketTypes = new InMemoryTicketTypeRepository();
  const batches = new InMemorySalesBatchRepository();
  const reservations = new InMemoryReservationStore(batches);
  const orders = new InMemoryOrderRepository(reservations);

  const event = await events.create({
    organizationId: ORG,
    title: "Show",
    slug: "show",
    timezone: "America/Sao_Paulo",
    capacityTotal: options?.capacity ?? 100,
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
    quantityTotal: options?.batchQty ?? 50,
  });
  batch.status = "OPEN";

  const publicEvents = {
    findPublishedById: async (eventId: string): Promise<EventRecord | null> => {
      const found = events.events.find((e) => e.id === eventId);
      return found && found.status === "PUBLISHED" ? found : null;
    },
  };

  const service = new OrdersService({
    orders,
    reservations,
    publicEvents,
    batches,
    audit,
    clock,
  });

  return { clock, audit, events, batches, reservations, orders, service, event, batch };
}

const buyer = { name: "Maria Compradora", email: "maria@teste.com" };

describe("createOrder", () => {
  it("creates AWAITING_PAYMENT with server-side totals and per-unit items", async () => {
    const env = await setup();

    const { order, expiresAt } = await env.service.createOrder(
      { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 3 }], buyer },
      { correlationId: "c1" },
    );

    expect(order.status).toBe("AWAITING_PAYMENT");
    expect(order.totalCents).toBe(30_000); // 3 × R$100 from the DB, not client
    expect(order.code).toHaveLength(12);
    expect(expiresAt.getTime()).toBe(env.clock.now().getTime() + 15 * 60 * 1000);

    const items = await env.orders.listItems(ORG, order.id);
    expect(items).toHaveLength(3);
    expect(env.batch.quantityReserved).toBe(3);
    expect(env.batch.quantitySold).toBe(0);
  });

  it("rejects an unpublished event", async () => {
    const env = await setup();
    env.event.status = "SALES_PAUSED";

    await expect(
      env.service.createOrder(
        { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 1 }], buyer },
        { correlationId: "c" },
      ),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });

  it("rejects a batch that is not OPEN", async () => {
    const env = await setup();
    env.batch.status = "CLOSED";

    await expect(
      env.service.createOrder(
        { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 1 }], buyer },
        { correlationId: "c" },
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects sales outside the event window", async () => {
    const env = await setup();
    env.event.salesEndAt = new Date(env.clock.now().getTime() - 1000);

    await expect(
      env.service.createOrder(
        { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 1 }], buyer },
        { correlationId: "c" },
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects sales before the batch window opens", async () => {
    const env = await setup();
    env.batch.salesStartAt = new Date(env.clock.now().getTime() + 60_000);

    await expect(
      env.service.createOrder(
        { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 1 }], buyer },
        { correlationId: "c" },
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("enforces batch maxPerOrder and event maxTicketsPerOrder", async () => {
    const env = await setup();
    env.batch.maxPerOrder = 2;

    await expect(
      env.service.createOrder(
        { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 3 }], buyer },
        { correlationId: "c" },
      ),
    ).rejects.toThrow(ValidationFailedError);

    env.batch.maxPerOrder = null;
    env.event.maxTicketsPerOrder = 4;
    await expect(
      env.service.createOrder(
        { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 5 }], buyer },
        { correlationId: "c" },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it("rejects when availability runs out and persists NOTHING", async () => {
    const env = await setup({ batchQty: 10 });

    await expect(
      env.service.createOrder(
        { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 11 }], buyer },
        { correlationId: "c" },
      ),
    ).rejects.toThrow(ConflictError);

    expect(env.batch.quantityReserved).toBe(0);
    expect(env.orders.orders).toHaveLength(0);
    expect(env.reservations.reservations).toHaveLength(0);
  });

  it("is all-or-nothing across batches", async () => {
    const env = await setup({ capacity: 100, batchQty: 50 });
    const smallBatch = await env.batches.create({
      organizationId: ORG,
      eventId: env.event.id,
      ticketTypeId: env.batch.ticketTypeId,
      name: "Lote VIP",
      priceCents: 20_000,
      quantityTotal: 2,
    });
    smallBatch.status = "OPEN";

    await expect(
      env.service.createOrder(
        {
          eventId: env.event.id,
          items: [
            { batchId: env.batch.id, quantity: 5 },
            { batchId: smallBatch.id, quantity: 3 }, // only 2 available
          ],
          buyer,
        },
        { correlationId: "c" },
      ),
    ).rejects.toThrow(ConflictError);

    // First batch reservation must have been rolled back too
    expect(env.batch.quantityReserved).toBe(0);
    expect(smallBatch.quantityReserved).toBe(0);
  });

  it("sells exactly to capacity, never beyond (BR-INV-001)", async () => {
    const env = await setup({ batchQty: 10 });
    const make = (quantity: number) =>
      env.service.createOrder(
        { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity }], buyer },
        { correlationId: "c" },
      );

    await make(5);
    await make(5);
    await expect(make(1)).rejects.toThrow(ConflictError);
    expect(env.batch.quantityReserved).toBe(10);
  });
});

describe("expireDueOrders", () => {
  it("expires overdue orders, releases inventory exactly once", async () => {
    const env = await setup({ batchQty: 10 });
    await env.service.createOrder(
      { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 4 }], buyer },
      { correlationId: "c" },
    );
    expect(env.batch.quantityReserved).toBe(4);

    env.clock.advance(16 * 60 * 1000);

    expect(await env.service.expireDueOrders()).toBe(1);
    expect(env.batch.quantityReserved).toBe(0);
    expect(env.orders.orders[0]?.status).toBe("EXPIRED");

    // Idempotent: nothing left to expire, counters untouched
    expect(await env.service.expireDueOrders()).toBe(0);
    expect(env.batch.quantityReserved).toBe(0);
  });
});

describe("markOrderPaid", () => {
  it("transitions once, confirms reservations, moves counters to sold", async () => {
    const env = await setup({ batchQty: 10 });
    const { order } = await env.service.createOrder(
      { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 4 }], buyer },
      { correlationId: "c" },
    );

    expect(await env.service.markOrderPaid(ORG, order.id, { correlationId: "c" })).toBe(true);
    expect(env.batch.quantitySold).toBe(4);
    expect(env.batch.quantityReserved).toBe(0);

    // Duplicated webhook: no second transition, counters stable
    expect(await env.service.markOrderPaid(ORG, order.id, { correlationId: "c" })).toBe(false);
    expect(env.batch.quantitySold).toBe(4);
  });

  it("flips the batch to SOLD_OUT when the last unit is sold", async () => {
    const env = await setup({ batchQty: 2 });
    const { order } = await env.service.createOrder(
      { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 2 }], buyer },
      { correlationId: "c" },
    );

    await env.service.markOrderPaid(ORG, order.id, { correlationId: "c" });
    expect(env.batch.status).toBe("SOLD_OUT");
  });

  it("does NOT resurrect an expired order; flags it for support instead", async () => {
    const env = await setup({ batchQty: 10 });
    const { order } = await env.service.createOrder(
      { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 4 }], buyer },
      { correlationId: "c" },
    );
    env.clock.advance(16 * 60 * 1000);
    await env.service.expireDueOrders();

    expect(await env.service.markOrderPaid(ORG, order.id, { correlationId: "c" })).toBe(false);
    expect(env.batch.quantitySold).toBe(0);
    expect(env.audit.byAction("order.payment_after_terminal_state")).toHaveLength(1);
  });
});

describe("getOrderForBuyer", () => {
  it("requires code AND matching buyer e-mail (anti-enumeration)", async () => {
    const env = await setup();
    const { order } = await env.service.createOrder(
      { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 1 }], buyer },
      { correlationId: "c" },
    );

    const found = await env.service.getOrderForBuyer(order.code, "maria@teste.com");
    expect(found.id).toBe(order.id);

    await expect(
      env.service.getOrderForBuyer(order.code, "outra@pessoa.com"),
    ).rejects.toThrow(NotFoundOrForbiddenError);
    await expect(
      env.service.getOrderForBuyer("CODIGOFALSO1", "maria@teste.com"),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });
});

describe("settleRefund (FR-PAY-011/013)", () => {
  it("transitions a PAID order to REFUNDED once (idempotent)", async () => {
    const env = await setup();
    const { order } = await env.service.createOrder(
      { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 1 }], buyer },
      { correlationId: "c" },
    );
    await env.service.markOrderPaid(ORG, order.id, { correlationId: "c" });

    const first = await env.service.settleRefund(ORG, order.id, "REFUNDED", { correlationId: "c" });
    const second = await env.service.settleRefund(ORG, order.id, "REFUNDED", { correlationId: "c" });

    expect(first).toBe(true);
    expect(second).toBe(false); // already terminal
    expect(env.orders.orders[0]?.status).toBe("REFUNDED");
    expect(env.audit.byAction("order.refunded")).toHaveLength(1);
  });

  it("does not refund an order that was never paid", async () => {
    const env = await setup();
    const { order } = await env.service.createOrder(
      { eventId: env.event.id, items: [{ batchId: env.batch.id, quantity: 1 }], buyer },
      { correlationId: "c" },
    );
    const done = await env.service.settleRefund(ORG, order.id, "REFUNDED", { correlationId: "c" });
    expect(done).toBe(false);
    expect(env.orders.orders[0]?.status).toBe("AWAITING_PAYMENT");
  });
});
