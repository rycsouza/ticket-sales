import { describe, expect, it } from "vitest";
import type { RequestContext } from "../../../shared/context";
import {
  ConflictError,
  InvalidTransitionError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../../shared/errors";
import { InMemoryAuditRepository, InMemoryMembershipRepository } from "../../../testing/fakes";
import {
  InMemoryEventRepository,
  InMemorySalesBatchRepository,
  InMemoryTicketTypeRepository,
} from "../../../testing/fakes-events";
import { InventoryService } from "../service";

const ORG = "org_A";
const USER = "user_manager";

function ctx(role = "EVENT_MANAGER", organizationId = ORG, userId = USER): RequestContext {
  return { organizationId, userId, role, correlationId: "corr" };
}

async function setup() {
  const audit = new InMemoryAuditRepository();
  const memberships = new InMemoryMembershipRepository();
  const events = new InMemoryEventRepository();
  const ticketTypes = new InMemoryTicketTypeRepository();
  const batches = new InMemorySalesBatchRepository();
  const service = new InventoryService({ ticketTypes, batches, events, memberships, audit });

  await memberships.create({ organizationId: ORG, userId: USER, role: "EVENT_MANAGER" });
  const event = await events.create({
    organizationId: ORG,
    title: "Show",
    slug: "show",
    timezone: "America/Sao_Paulo",
    capacityTotal: 500,
  });

  return { audit, memberships, events, ticketTypes, batches, service, event };
}

describe("createTicketType", () => {
  it("creates and audits", async () => {
    const env = await setup();

    const ticketType = await env.service.createTicketType(ctx(), env.event.id, {
      name: "Inteira",
      kind: "FULL",
    });

    expect(ticketType.kind).toBe("FULL");
    expect(env.audit.byAction("ticket_type.created")).toHaveLength(1);
  });

  it("rejects duplicate names per event", async () => {
    const env = await setup();
    await env.service.createTicketType(ctx(), env.event.id, { name: "Inteira", kind: "FULL" });

    await expect(
      env.service.createTicketType(ctx(), env.event.id, { name: "Inteira", kind: "HALF" }),
    ).rejects.toThrow(ConflictError);
  });

  it("blocks unauthorized roles", async () => {
    const env = await setup();
    await env.memberships.create({ organizationId: ORG, userId: "u2", role: "PROMOTER" });

    await expect(
      env.service.createTicketType(ctx("PROMOTER", ORG, "u2"), env.event.id, {
        name: "Inteira",
        kind: "FULL",
      }),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });
});

describe("createSalesBatch", () => {
  async function withTicketType() {
    const env = await setup();
    const ticketType = await env.service.createTicketType(ctx(), env.event.id, {
      name: "Inteira",
      kind: "FULL",
    });
    return { ...env, ticketType };
  }

  it("creates a batch within capacity", async () => {
    const env = await withTicketType();

    const batch = await env.service.createSalesBatch(ctx(), env.event.id, {
      ticketTypeId: env.ticketType.id,
      name: "Lote 1",
      priceCents: 8000,
      quantityTotal: 300,
    });

    expect(batch.status).toBe("SCHEDULED");
    expect(env.audit.byAction("sales_batch.created")).toHaveLength(1);
  });

  it("rejects aggregate quantity beyond event capacity (FR-INV-004)", async () => {
    const env = await withTicketType();
    await env.service.createSalesBatch(ctx(), env.event.id, {
      ticketTypeId: env.ticketType.id,
      name: "Lote 1",
      priceCents: 8000,
      quantityTotal: 300,
    });

    await expect(
      env.service.createSalesBatch(ctx(), env.event.id, {
        ticketTypeId: env.ticketType.id,
        name: "Lote 2",
        priceCents: 10000,
        quantityTotal: 201, // 300 + 201 > 500
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects a ticket type from another event", async () => {
    const env = await withTicketType();
    const otherEvent = await env.events.create({
      organizationId: ORG,
      title: "Outro",
      slug: "outro",
      timezone: "America/Sao_Paulo",
    });

    await expect(
      env.service.createSalesBatch(ctx(), otherEvent.id, {
        ticketTypeId: env.ticketType.id,
        name: "Lote 1",
        priceCents: 8000,
        quantityTotal: 10,
      }),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });
});

describe("updateBatchQuantity", () => {
  async function withBatch() {
    const env = await setup();
    const ticketType = await env.service.createTicketType(ctx(), env.event.id, {
      name: "Inteira",
      kind: "FULL",
    });
    const batch = await env.service.createSalesBatch(ctx(), env.event.id, {
      ticketTypeId: ticketType.id,
      name: "Lote 1",
      priceCents: 8000,
      quantityTotal: 300,
    });
    return { ...env, ticketType, batch };
  }

  it("blocks reducing below the committed total (FR-INV-009)", async () => {
    const env = await withBatch();
    env.batch.quantitySold = 120;
    env.batch.quantityReserved = 30;

    await expect(
      env.service.updateBatchQuantity(ctx(), env.batch.id, 100, "reduzir lote com vendas"),
    ).rejects.toThrow(ConflictError);
  });

  it("requires justification after sales started", async () => {
    const env = await withBatch();
    env.batch.quantitySold = 10;

    await expect(env.service.updateBatchQuantity(ctx(), env.batch.id, 200)).rejects.toThrow(
      ValidationFailedError,
    );
  });

  it("allows change before sales without justification, audited", async () => {
    const env = await withBatch();

    const updated = await env.service.updateBatchQuantity(ctx(), env.batch.id, 200);

    expect(updated.quantityTotal).toBe(200);
    const entry = env.audit.byAction("sales_batch.quantity_changed")[0];
    expect(entry?.before).toEqual({ quantityTotal: 300 });
    expect(entry?.after).toEqual({ quantityTotal: 200 });
  });

  it("keeps the event-capacity invariant when other batches exist", async () => {
    const env = await withBatch();
    await env.service.createSalesBatch(ctx(), env.event.id, {
      ticketTypeId: env.ticketType.id,
      name: "Lote 2",
      priceCents: 10000,
      quantityTotal: 100,
    });

    // 300 -> 450 while Lote 2 has 100: 450 + 100 > 500
    await expect(env.service.updateBatchQuantity(ctx(), env.batch.id, 450)).rejects.toThrow(
      ConflictError,
    );
  });
});

describe("batch lifecycle", () => {
  async function withBatch() {
    const env = await setup();
    const ticketType = await env.service.createTicketType(ctx(), env.event.id, {
      name: "Inteira",
      kind: "FULL",
    });
    const batch = await env.service.createSalesBatch(ctx(), env.event.id, {
      ticketTypeId: ticketType.id,
      name: "Lote 1",
      priceCents: 8000,
      quantityTotal: 100,
    });
    return { ...env, batch };
  }

  it("opens and closes manually (FR-INV-011)", async () => {
    const env = await withBatch();

    const open = await env.service.openBatch(ctx(), env.batch.id);
    expect(open.status).toBe("OPEN");
    const closed = await env.service.closeBatch(ctx(), env.batch.id);
    expect(closed.status).toBe("CLOSED");
    expect(env.audit.byAction("sales_batch.status_changed")).toHaveLength(2);
  });

  it("rejects invalid transitions (SCHEDULED → SOLD_OUT is not manual)", async () => {
    const env = await withBatch();
    env.batch.status = "OPEN";
    env.batch.quantitySold = 100;

    // reopening a full batch is blocked even though SOLD_OUT → OPEN exists
    env.batch.status = "SOLD_OUT";
    await expect(env.service.openBatch(ctx(), env.batch.id)).rejects.toThrow(ConflictError);
  });

  it("rejects closing an already closed batch", async () => {
    const env = await withBatch();
    await env.service.openBatch(ctx(), env.batch.id);
    await env.service.closeBatch(ctx(), env.batch.id);

    await expect(env.service.closeBatch(ctx(), env.batch.id)).rejects.toThrow(
      InvalidTransitionError,
    );
  });
});

describe("tenant isolation", () => {
  it("org B cannot touch org A batches", async () => {
    const env = await setup();
    const ticketType = await env.service.createTicketType(ctx(), env.event.id, {
      name: "Inteira",
      kind: "FULL",
    });
    const batch = await env.service.createSalesBatch(ctx(), env.event.id, {
      ticketTypeId: ticketType.id,
      name: "Lote 1",
      priceCents: 8000,
      quantityTotal: 100,
    });

    await env.memberships.create({ organizationId: "org_B", userId: "user_b", role: "OWNER" });
    const ctxB = ctx("OWNER", "org_B", "user_b");

    await expect(env.service.openBatch(ctxB, batch.id)).rejects.toThrow(NotFoundOrForbiddenError);
    await expect(
      env.service.updateBatchQuantity(ctxB, batch.id, 9999, "tentativa cruzada"),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });
});
