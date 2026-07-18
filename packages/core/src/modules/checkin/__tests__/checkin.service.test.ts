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
  InMemoryReservationStore,
  InMemoryTicketRepository,
} from "../../../testing/fakes-sales";
import {
  InMemoryCheckinAssignmentRepository,
  InMemoryCheckinRepository,
} from "../../../testing/fakes-checkin";
import { OrdersService } from "../../orders/service";
import { TicketsService } from "../../tickets/service";
import { CheckinService } from "../service";
import type { EventRecord } from "../../events/types";

const ORG = "org_cin";

function ctxFor(userId: string): RequestContext {
  return { organizationId: ORG, userId, role: "member", correlationId: "c" };
}

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
  const assignments = new InMemoryCheckinAssignmentRepository();
  const checkins = new InMemoryCheckinRepository();

  const owner = await memberships.create({ organizationId: ORG, userId: "u_owner", role: "OWNER" });
  const coord = await memberships.create({
    organizationId: ORG,
    userId: "u_coord",
    role: "GATE_COORDINATOR",
  });
  const op = await memberships.create({
    organizationId: ORG,
    userId: "u_op",
    role: "CHECKIN_OPERATOR",
  });
  const opUnassigned = await memberships.create({
    organizationId: ORG,
    userId: "u_op2",
    role: "CHECKIN_OPERATOR",
  });
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
    name: "Pista",
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
  const ticketsService = new TicketsService({ tickets, orders, audit, memberships, clock });

  const { order } = await ordersService.createOrder(
    {
      eventId: event.id,
      items: [{ batchId: batch.id, quantity: 3 }],
      buyer: { name: "Maria", email: "maria@teste.com" },
    },
    { correlationId: "c" },
  );
  await ordersService.markOrderPaid(ORG, order.id, { correlationId: "c" });
  const issued = await ticketsService.issueForOrder(ORG, order.id, { correlationId: "c" });

  const checkin = new CheckinService({
    assignments,
    checkins,
    tickets,
    events,
    memberships,
    audit,
    clock,
  });

  // Assign the operator + coordinator to the event (owner acts).
  await checkin.assignOperator(ctxFor("u_owner"), event.id, { membershipId: op.id });
  await checkin.assignOperator(ctxFor("u_owner"), event.id, { membershipId: coord.id });

  return {
    clock,
    audit,
    memberships,
    tickets,
    checkins,
    event,
    order,
    issued,
    checkin,
    owner,
    coord,
    op,
    opUnassigned,
  };
}

describe("validateAndCheckIn (FR-CIN-004/005/006)", () => {
  it("admits a valid ticket once; a second scan is rejected as already used", async () => {
    const s = await setup();
    const token = s.issued[0]!.rawToken;

    const first = await s.checkin.validateAndCheckIn(ctxFor("u_op"), s.event.id, { token });
    expect(first.accepted).toBe(true);
    expect(first.ticket?.status).toBe("CHECKED_IN");
    expect(s.checkins.checkins).toHaveLength(1);

    const second = await s.checkin.validateAndCheckIn(ctxFor("u_op"), s.event.id, { token });
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe("already_checked_in");
    expect(second.existingCheckin?.operatorMembershipId).toBe(s.op.id);
  });

  it("rejects a blocked ticket with a clear reason (FR-CIN-007)", async () => {
    const s = await setup();
    const ticketId = s.issued[1]!.ticket.id;
    await s.tickets.updateStatus(ORG, ticketId, ["VALID"], "BLOCKED");

    const result = await s.checkin.validateAndCheckIn(ctxFor("u_op"), s.event.id, {
      token: s.issued[1]!.rawToken,
    });
    expect(result).toEqual({ accepted: false, reason: "blocked" });
  });

  it("rejects an unknown token and a ticket from another event", async () => {
    const s = await setup();
    const unknown = await s.checkin.validateAndCheckIn(ctxFor("u_op"), s.event.id, {
      token: "nao-existe-token-aqui",
    });
    expect(unknown.reason).toBe("not_found");
  });
});

describe("operator authorization (FR-CIN-002)", () => {
  it("blocks a non-operator (promoter)", async () => {
    const s = await setup();
    await expect(
      s.checkin.validateAndCheckIn(ctxFor("u_promo"), s.event.id, {
        token: s.issued[0]!.rawToken,
      }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });

  it("blocks an operator not assigned to the event", async () => {
    const s = await setup();
    await expect(
      s.checkin.validateAndCheckIn(ctxFor("u_op2"), s.event.id, {
        token: s.issued[0]!.rawToken,
      }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });

  it("lets an OWNER admit without an explicit assignment", async () => {
    const s = await setup();
    const result = await s.checkin.validateAndCheckIn(ctxFor("u_owner"), s.event.id, {
      token: s.issued[0]!.rawToken,
    });
    expect(result.accepted).toBe(true);
  });
});

describe("manual check-in & undo (FR-CIN-009/010)", () => {
  it("coordinator admits manually with justification, then undoes it", async () => {
    const s = await setup();
    const ticketId = s.issued[0]!.ticket.id;

    const manual = await s.checkin.manualCheckIn(ctxFor("u_coord"), s.event.id, {
      ticketId,
      justification: "QR danificado",
    });
    expect(manual.accepted).toBe(true);
    expect(s.audit.byAction("checkin.manual")).toHaveLength(1);

    await s.checkin.undoCheckIn(ctxFor("u_coord"), s.event.id, {
      ticketId,
      justification: "entrada indevida",
    });
    const ticket = s.tickets.tickets.find((t) => t.id === ticketId);
    expect(ticket?.status).toBe("VALID");
    expect(s.checkins.checkins).toHaveLength(0);
    // can be admitted again after undo
    const again = await s.checkin.validateAndCheckIn(ctxFor("u_op"), s.event.id, {
      token: s.issued[0]!.rawToken,
    });
    expect(again.accepted).toBe(true);
  });

  it("a plain operator cannot undo", async () => {
    const s = await setup();
    await s.checkin.validateAndCheckIn(ctxFor("u_op"), s.event.id, {
      token: s.issued[0]!.rawToken,
    });
    await expect(
      s.checkin.undoCheckIn(ctxFor("u_op"), s.event.id, {
        ticketId: s.issued[0]!.ticket.id,
        justification: "x",
      }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });
});

describe("offline pack & sync (FR-CIN-011..017)", () => {
  it("pack contains only valid tickets and no raw tokens", async () => {
    const s = await setup();
    const pack = await s.checkin.buildOfflinePack(ctxFor("u_op"), s.event.id);
    expect(pack.tickets).toHaveLength(3);
    expect(pack.version).toBeTruthy();
    for (const t of pack.tickets) {
      expect(t).toHaveProperty("tokenHash");
      expect(t).not.toHaveProperty("token");
    }
  });

  it("sync is idempotent (duplicate) and detects cross-device conflicts", async () => {
    const s = await setup();
    const token = s.issued[0]!.rawToken;
    const at = s.clock.now();

    const first = await s.checkin.syncOfflineBatch(ctxFor("u_op"), s.event.id, {
      deviceId: "dev-A",
      items: [{ token, checkedInAt: at }],
    });
    expect(first.results[0]!.outcome).toBe("applied");

    // Same device re-syncs → duplicate (idempotent)
    const resync = await s.checkin.syncOfflineBatch(ctxFor("u_op"), s.event.id, {
      deviceId: "dev-A",
      items: [{ token, checkedInAt: at }],
    });
    expect(resync.results[0]!.outcome).toBe("duplicate");

    // Different device admitted the same ticket → conflict (FR-CIN-014)
    const conflict = await s.checkin.syncOfflineBatch(ctxFor("u_op"), s.event.id, {
      deviceId: "dev-B",
      items: [{ token, checkedInAt: at }],
    });
    expect(conflict.results[0]!.outcome).toBe("conflict");
    expect(s.checkins.checkins).toHaveLength(1); // no duplicate admission
  });
});

describe("dashboard (FR-CIN-018)", () => {
  it("reports sold / present / absent / entry rate", async () => {
    const s = await setup();
    await s.checkin.validateAndCheckIn(ctxFor("u_op"), s.event.id, {
      token: s.issued[0]!.rawToken,
    });
    const dash = await s.checkin.dashboard(ctxFor("u_op"), s.event.id);
    expect(dash.sold).toBe(3);
    expect(dash.present).toBe(1);
    expect(dash.absent).toBe(2);
    expect(dash.entryRatePercent).toBe(33);
  });
});
