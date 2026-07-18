import { describe, expect, it } from "vitest";
import { NotFoundOrForbiddenError } from "../../../shared/errors";
import type { RequestContext } from "../../../shared/context";
import {
  FakeClock,
  InMemoryAuditRepository,
  InMemoryMembershipRepository,
} from "../../../testing/fakes";
import {
  InMemoryEventRepository,
  InMemorySalesBatchRepository,
  InMemoryTicketTypeRepository,
} from "../../../testing/fakes-events";
import {
  InMemoryOrderRepository,
  InMemoryPaymentRepository,
  InMemoryReservationStore,
  InMemoryTicketRepository,
} from "../../../testing/fakes-sales";
import { InMemoryOrderNoteRepository } from "../../../testing/fakes-support";
import { OrdersService } from "../../orders/service";
import { TicketsService } from "../../tickets/service";
import { SupportService } from "../service";
import type { EventRecord } from "../../events/types";

const ORG = "org_sup";
const OTHER_ORG = "org_x";

async function setup() {
  const clock = new FakeClock();
  const audit = new InMemoryAuditRepository();
  const memberships = new InMemoryMembershipRepository();
  const events = new InMemoryEventRepository();
  const ticketTypes = new InMemoryTicketTypeRepository();
  const batches = new InMemorySalesBatchRepository();
  const reservations = new InMemoryReservationStore(batches);
  const orders = new InMemoryOrderRepository(reservations);
  const tickets = new InMemoryTicketRepository();
  const payments = new InMemoryPaymentRepository();
  const notes = new InMemoryOrderNoteRepository();

  await memberships.create({ organizationId: ORG, userId: "u_support", role: "SUPPORT" });
  await memberships.create({ organizationId: ORG, userId: "u_promo", role: "PROMOTER" });

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
  const ticketsService = new TicketsService({
    tickets,
    orders,
    audit,
    memberships,
    auditReader: audit,
    clock,
  });
  const support = new SupportService({
    notes,
    orders,
    payments,
    tickets,
    audit,
    memberships,
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
  await ordersService.markOrderPaid(ORG, order.id, { correlationId: "c" });
  const issued = await ticketsService.issueForOrder(ORG, order.id, { correlationId: "c" });

  const supportCtx: RequestContext = {
    organizationId: ORG,
    userId: "u_support",
    role: "member",
    correlationId: "c",
  };
  const promoterCtx: RequestContext = {
    organizationId: ORG,
    userId: "u_promo",
    role: "member",
    correlationId: "c",
  };

  return { support, ticketsService, order, issued, supportCtx, promoterCtx, memberships };
}

describe("getOrderTimeline (FR-ADM-002)", () => {
  it("aggregates order, tickets, and audit events (order + per-ticket)", async () => {
    const s = await setup();
    // generate a per-ticket audit event
    await s.ticketsService.blockTicket(s.supportCtx, s.issued[0]!.ticket.id, {
      justification: "checar",
    });

    const timeline = await s.support.getOrderTimeline(s.supportCtx, s.order.id);
    expect(timeline.order.id).toBe(s.order.id);
    expect(timeline.tickets).toHaveLength(2);

    const actions = timeline.events.map((e) => e.action);
    expect(actions).toContain("order.paid"); // resource "order"
    expect(actions).toContain("ticket.blocked"); // resource "ticket"
    // events are chronologically ordered
    const times = timeline.events.map((e) => e.createdAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("blocks a promoter and denies cross-org access", async () => {
    const s = await setup();
    await expect(
      s.support.getOrderTimeline(s.promoterCtx, s.order.id),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);

    await s.memberships.create({ organizationId: OTHER_ORG, userId: "u_x", role: "SUPPORT" });
    const ctxX: RequestContext = {
      organizationId: OTHER_ORG,
      userId: "u_x",
      role: "member",
      correlationId: "c",
    };
    await expect(s.support.getOrderTimeline(ctxX, s.order.id)).rejects.toBeInstanceOf(
      NotFoundOrForbiddenError,
    );
  });
});

describe("searchOrders (FR-ADM-001)", () => {
  it("finds an order by code, e-mail, name — bounded and role-gated", async () => {
    const s = await setup();

    const byEmail = await s.support.searchOrders(s.supportCtx, {
      q: "maria@teste.com",
      limit: 20,
    });
    expect(byEmail).toHaveLength(1);
    expect(byEmail[0]!.id).toBe(s.order.id);
    // Narrow projection: no correlation id / raw row leakage.
    expect(byEmail[0]).not.toHaveProperty("correlationId");

    const byCode = await s.support.searchOrders(s.supportCtx, { q: s.order.code, limit: 20 });
    expect(byCode.map((o) => o.id)).toContain(s.order.id);

    const byName = await s.support.searchOrders(s.supportCtx, { q: "mari", limit: 20 });
    expect(byName.map((o) => o.id)).toContain(s.order.id);

    const miss = await s.support.searchOrders(s.supportCtx, { q: "inexistente@x.com", limit: 20 });
    expect(miss).toHaveLength(0);
  });

  it("filters by status and respects the limit", async () => {
    const s = await setup();
    const paid = await s.support.searchOrders(s.supportCtx, { status: "PAID", limit: 20 });
    expect(paid.map((o) => o.id)).toContain(s.order.id);

    const awaiting = await s.support.searchOrders(s.supportCtx, {
      status: "AWAITING_PAYMENT",
      limit: 20,
    });
    expect(awaiting.map((o) => o.id)).not.toContain(s.order.id);
  });

  it("denies a promoter and cross-org access", async () => {
    const s = await setup();
    await expect(
      s.support.searchOrders(s.promoterCtx, { q: "maria", limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);

    await s.memberships.create({ organizationId: OTHER_ORG, userId: "u_x2", role: "SUPPORT" });
    const ctxX: RequestContext = {
      organizationId: OTHER_ORG,
      userId: "u_x2",
      role: "member",
      correlationId: "c",
    };
    const foreign = await s.support.searchOrders(ctxX, { q: "maria@teste.com", limit: 20 });
    expect(foreign).toHaveLength(0);
  });
});

describe("internal notes (FR-ADM-009)", () => {
  it("adds and lists notes for support roles", async () => {
    const s = await setup();
    const note = await s.support.addNote(s.supportCtx, s.order.id, { body: "cliente ligou" });
    expect(note.body).toBe("cliente ligou");

    const list = await s.support.listNotes(s.supportCtx, s.order.id);
    expect(list).toHaveLength(1);
  });

  it("a promoter cannot read or write notes", async () => {
    const s = await setup();
    await expect(
      s.support.addNote(s.promoterCtx, s.order.id, { body: "x" }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
    await expect(s.support.listNotes(s.promoterCtx, s.order.id)).rejects.toBeInstanceOf(
      NotFoundOrForbiddenError,
    );
  });
});
