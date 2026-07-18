import { describe, expect, it } from "vitest";
import {
  ConflictError,
  InvalidTransitionError,
  NotFoundOrForbiddenError,
} from "../../../shared/errors";
import type { RequestContext } from "../../../shared/context";
import { hashToken } from "../../../shared/tokens";
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
import { OrdersService } from "../../orders/service";
import { TicketsService } from "../service";
import type { EventRecord } from "../../events/types";

const ORG = "org_ops";
const OTHER_ORG = "org_other";

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

  return { audit, tickets, ticketsService, order, issued, supportCtx, promoterCtx, memberships };
}

describe("block / unblock (FR-TKT-009)", () => {
  it("blocks a valid ticket with justification and audits before/after", async () => {
    const s = await setup();
    const id = s.issued[0]!.ticket.id;

    const blocked = await s.ticketsService.blockTicket(s.supportCtx, id, {
      justification: "fraude confirmada",
    });
    expect(blocked.status).toBe("BLOCKED");
    const entry = s.audit.byAction("ticket.blocked")[0];
    expect(entry?.justification).toBe("fraude confirmada");
    expect((entry?.before as { status: string }).status).toBe("VALID");
  });

  it("unblocks a blocked ticket", async () => {
    const s = await setup();
    const id = s.issued[0]!.ticket.id;
    await s.ticketsService.blockTicket(s.supportCtx, id, { justification: "revisar" });
    const unblocked = await s.ticketsService.unblockTicket(s.supportCtx, id, {
      justification: "liberado",
    });
    expect(unblocked.status).toBe("VALID");
  });

  it("rejects blocking an already-blocked ticket (invalid transition)", async () => {
    const s = await setup();
    const id = s.issued[0]!.ticket.id;
    await s.ticketsService.blockTicket(s.supportCtx, id, { justification: "x1" });
    await expect(
      s.ticketsService.blockTicket(s.supportCtx, id, { justification: "x2" }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("blocked ticket status makes it rejectable at check-in (FR-TKT-010)", async () => {
    const s = await setup();
    const id = s.issued[0]!.ticket.id;
    await s.ticketsService.blockTicket(s.supportCtx, id, { justification: "x" });
    const ticket = s.tickets.tickets.find((t) => t.id === id);
    expect(ticket?.status).toBe("BLOCKED");
  });
});

describe("authorization & tenancy", () => {
  it("a promoter cannot run support operations", async () => {
    const s = await setup();
    const id = s.issued[0]!.ticket.id;
    await expect(
      s.ticketsService.blockTicket(s.promoterCtx, id, { justification: "nope" }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });

  it("org B support cannot touch org A's ticket (generic 404)", async () => {
    const s = await setup();
    await s.memberships.create({ organizationId: OTHER_ORG, userId: "u_b", role: "SUPPORT" });
    const ctxB: RequestContext = {
      organizationId: OTHER_ORG,
      userId: "u_b",
      role: "member",
      correlationId: "c",
    };
    await expect(
      s.ticketsService.blockTicket(ctxB, s.issued[0]!.ticket.id, { justification: "x" }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });
});

describe("participant correction (FR-TKT-012/013)", () => {
  it("updates data and preserves the old value in the audit trail", async () => {
    const s = await setup();
    const id = s.issued[0]!.ticket.id;

    const corrected = await s.ticketsService.correctParticipant(s.supportCtx, id, {
      participantName: "João Silva",
    });
    expect(corrected.participantName).toBe("João Silva");

    const entry = s.audit.byAction("ticket.participant_corrected")[0];
    expect((entry?.before as { participantName: string }).participantName).toBe("Maria");
    expect((entry?.after as { participantName: string }).participantName).toBe("João Silva");
  });
});

describe("transfer (FR-TKT-007/008)", () => {
  it("rotates the token (old link dies) and records the previous holder", async () => {
    const s = await setup();
    const original = s.issued[0]!;
    const oldHash = s.tickets.tickets.find((t) => t.id === original.ticket.id)!.tokenHash;

    const transferred = await s.ticketsService.transferTicket(s.supportCtx, original.ticket.id, {
      participantName: "Nova Dona",
      participantEmail: "nova@teste.com",
    });

    // New raw token maps to the new hash; the old hash no longer matches.
    expect(hashToken(transferred.rawToken)).toBe(transferred.ticket.tokenHash);
    expect(transferred.ticket.tokenHash).not.toBe(oldHash);
    expect(transferred.ticket.participantName).toBe("Nova Dona");

    const entry = s.audit.byAction("ticket.transferred")[0];
    expect((entry?.before as { participantName: string }).participantName).toBe("Maria");
    expect((entry?.after as { tokenRotated: boolean }).tokenRotated).toBe(true);
  });

  it("refuses to transfer a blocked ticket", async () => {
    const s = await setup();
    const id = s.issued[0]!.ticket.id;
    await s.ticketsService.blockTicket(s.supportCtx, id, { justification: "x" });
    await expect(
      s.ticketsService.transferTicket(s.supportCtx, id, {
        participantName: "X",
        participantEmail: "x@x.com",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("history (FR-TKT-011)", () => {
  it("returns the ticket plus its audited events", async () => {
    const s = await setup();
    const id = s.issued[0]!.ticket.id;
    await s.ticketsService.blockTicket(s.supportCtx, id, { justification: "a" });
    await s.ticketsService.unblockTicket(s.supportCtx, id, { justification: "b" });

    const { ticket, history } = await s.ticketsService.getTicketHistory(s.supportCtx, id);
    expect(ticket.id).toBe(id);
    const actions = history.map((h) => h.action);
    expect(actions).toContain("ticket.blocked");
    expect(actions).toContain("ticket.unblocked");
  });
});

describe("refundTicketsForOrder (FR-PAY-013/FR-TKT-010)", () => {
  it("refunds all non-terminal tickets of the order, idempotently", async () => {
    const s = await setup();

    const first = await s.ticketsService.refundTicketsForOrder(ORG, s.order.id, {
      correlationId: "c",
    });
    const second = await s.ticketsService.refundTicketsForOrder(ORG, s.order.id, {
      correlationId: "c",
    });

    expect(first).toBe(2);
    expect(second).toBe(0); // nothing left in a refundable state
    for (const t of s.tickets.tickets.filter((t) => t.orderId === s.order.id)) {
      expect(t.status).toBe("REFUNDED");
    }
  });
});
