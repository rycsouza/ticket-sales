import { describe, expect, it } from "vitest";
import { NotFoundOrForbiddenError } from "../../../shared/errors";
import { hashToken } from "../../../shared/tokens";
import { FakeClock, InMemoryAuditRepository } from "../../../testing/fakes";
import {
  InMemoryEventRepository,
  InMemorySalesBatchRepository,
  InMemoryTicketTypeRepository,
} from "../../../testing/fakes-events";
import {
  InMemoryOrderRepository,
  InMemoryReservationStore,
  InMemoryTicketRepository,
} from "../../../testing/fakes-sales";
import { OrdersService } from "../../orders/service";
import { TicketsService } from "../service";
import type { EventRecord } from "../../events/types";

const ORG = "org_tix";

async function setupPaidOrder() {
  const clock = new FakeClock();
  const audit = new InMemoryAuditRepository();
  const events = new InMemoryEventRepository();
  const ticketTypes = new InMemoryTicketTypeRepository();
  const batches = new InMemorySalesBatchRepository();
  const reservations = new InMemoryReservationStore(batches);
  const orders = new InMemoryOrderRepository(reservations);
  const tickets = new InMemoryTicketRepository();

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
  const ticketsService = new TicketsService({ tickets, orders, audit });

  const { order } = await ordersService.createOrder(
    {
      eventId: event.id,
      items: [{ batchId: batch.id, quantity: 3 }],
      buyer: { name: "Maria", email: "maria@teste.com" },
    },
    { correlationId: "c" },
  );
  await ordersService.markOrderPaid(ORG, order.id, { correlationId: "c" });

  return { audit, orders, tickets, ticketsService, ordersService, order };
}

describe("issueForOrder", () => {
  it("issues one VALID ticket per item, storing only the token hash", async () => {
    const env = await setupPaidOrder();

    const issued = await env.ticketsService.issueForOrder(ORG, env.order.id, {
      correlationId: "c",
    });

    expect(issued).toHaveLength(3);
    for (const { ticket, rawToken } of issued) {
      expect(ticket.status).toBe("VALID");
      expect(ticket.tokenHash).toBe(hashToken(rawToken));
      expect(ticket.tokenHash).not.toBe(rawToken);
    }
    const tokens = new Set(issued.map((entry) => entry.rawToken));
    expect(tokens.size).toBe(3);
    expect(env.audit.byAction("tickets.issued")).toHaveLength(1);
  });

  it("is idempotent — a duplicated webhook cannot double-issue (FR-TKT-016)", async () => {
    const env = await setupPaidOrder();

    await env.ticketsService.issueForOrder(ORG, env.order.id, { correlationId: "c" });
    const second = await env.ticketsService.issueForOrder(ORG, env.order.id, {
      correlationId: "c",
    });

    expect(second).toHaveLength(0);
    expect(env.tickets.tickets).toHaveLength(3);
  });

  it("refuses to issue for an unpaid order (BR-PAY-003)", async () => {
    const env = await setupPaidOrder();
    // force back to AWAITING_PAYMENT to simulate an unpaid order
    const order = env.orders.orders.find((o) => o.id === env.order.id);
    if (order) order.status = "AWAITING_PAYMENT";

    await expect(
      env.ticketsService.issueForOrder(ORG, env.order.id, { correlationId: "c" }),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });
});

describe("getPublicTicket", () => {
  it("resolves a ticket by raw token; garbage tokens get the generic error", async () => {
    const env = await setupPaidOrder();
    const [first] = await env.ticketsService.issueForOrder(ORG, env.order.id, {
      correlationId: "c",
    });

    const ticket = await env.ticketsService.getPublicTicket(first!.rawToken);
    expect(ticket.id).toBe(first!.ticket.id);

    await expect(env.ticketsService.getPublicTicket("nao-e-um-token")).rejects.toThrow(
      NotFoundOrForbiddenError,
    );
  });
});
