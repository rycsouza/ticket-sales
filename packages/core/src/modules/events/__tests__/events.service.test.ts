import { describe, expect, it } from "vitest";
import type { RequestContext } from "../../../shared/context";
import {
  ConflictError,
  InvalidTransitionError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../../shared/errors";
import { FakeClock, InMemoryAuditRepository, InMemoryMembershipRepository } from "../../../testing/fakes";
import {
  InMemoryEventRepository,
  InMemorySalesBatchRepository,
  InMemorySectorRepository,
} from "../../../testing/fakes-events";
import { EventsService } from "../service";

function setup() {
  const clock = new FakeClock();
  const audit = new InMemoryAuditRepository();
  const memberships = new InMemoryMembershipRepository();
  const events = new InMemoryEventRepository();
  const sectors = new InMemorySectorRepository();
  const batches = new InMemorySalesBatchRepository();
  const service = new EventsService({
    events,
    sectors,
    memberships,
    inventory: batches,
    audit,
    clock,
  });
  return { clock, audit, memberships, events, sectors, batches, service };
}

const ORG = "org_A";
const USER = "user_manager";

function ctx(role = "EVENT_MANAGER", organizationId = ORG, userId = USER): RequestContext {
  return { organizationId, userId, role, correlationId: "corr" };
}

async function withManager(env: ReturnType<typeof setup>, role = "EVENT_MANAGER") {
  await env.memberships.create({
    organizationId: ORG,
    userId: USER,
    role: role as never,
  });
}

const baseEvent = { title: "Festa Junina", slug: "festa-junina", timezone: "America/Sao_Paulo" };

const completeEvent = {
  ...baseEvent,
  venueName: "Arena Central",
  city: "Fortaleza",
  startsAt: new Date("2026-09-01T22:00:00Z"),
  capacityTotal: 500,
};

describe("createEvent", () => {
  it("creates a DRAFT event and audits", async () => {
    const env = setup();
    await withManager(env);

    const event = await env.service.createEvent(ctx(), baseEvent);

    expect(event.status).toBe("DRAFT");
    expect(env.audit.byAction("event.created")).toHaveLength(1);
  });

  it("blocks roles outside OWNER/ADMIN/EVENT_MANAGER", async () => {
    const env = setup();
    await env.memberships.create({ organizationId: ORG, userId: USER, role: "FINANCE" });

    await expect(env.service.createEvent(ctx("FINANCE"), baseEvent)).rejects.toThrow(
      NotFoundOrForbiddenError,
    );
  });

  it("rejects duplicate slug within the organization", async () => {
    const env = setup();
    await withManager(env);

    await env.service.createEvent(ctx(), baseEvent);
    await expect(env.service.createEvent(ctx(), baseEvent)).rejects.toThrow(ConflictError);
  });
});

describe("publishEvent", () => {
  it("rejects publishing an incomplete event, naming what is missing", async () => {
    const env = setup();
    await withManager(env);
    const event = await env.service.createEvent(ctx(), baseEvent);

    const error = await env.service.publishEvent(ctx(), event.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationFailedError);
    expect((error as Error).message).toContain("venueName");
    expect((error as Error).message).toContain("capacityTotal");
    expect((error as Error).message).toContain("sales batch");
  });

  it("publishes a complete event and stamps publishedAt once", async () => {
    const env = setup();
    await withManager(env);
    const event = await env.service.createEvent(ctx(), completeEvent);
    await env.batches.create({
      organizationId: ORG,
      eventId: event.id,
      ticketTypeId: "tt",
      name: "Lote 1",
      priceCents: 5000,
      quantityTotal: 100,
    });

    const published = await env.service.publishEvent(ctx(), event.id);

    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).not.toBeNull();
    expect(env.audit.byAction("event.status_changed")).toHaveLength(1);
  });
});

describe("state machine", () => {
  async function publishedEvent(env: ReturnType<typeof setup>) {
    const event = await env.service.createEvent(ctx(), completeEvent);
    await env.batches.create({
      organizationId: ORG,
      eventId: event.id,
      ticketTypeId: "tt",
      name: "Lote 1",
      priceCents: 5000,
      quantityTotal: 100,
    });
    return env.service.publishEvent(ctx(), event.id);
  }

  it("pause ↔ resume works", async () => {
    const env = setup();
    await withManager(env);
    const event = await publishedEvent(env);

    const paused = await env.service.pauseSales(ctx(), event.id);
    expect(paused.status).toBe("SALES_PAUSED");
    const resumed = await env.service.resumeSales(ctx(), event.id);
    expect(resumed.status).toBe("PUBLISHED");
  });

  it("rejects invalid transitions (DRAFT → SALES_PAUSED)", async () => {
    const env = setup();
    await withManager(env);
    const event = await env.service.createEvent(ctx(), completeEvent);

    await expect(env.service.pauseSales(ctx(), event.id)).rejects.toThrow(
      InvalidTransitionError,
    );
  });

  it("cancel requires justification and is terminal", async () => {
    const env = setup();
    await withManager(env);
    const event = await publishedEvent(env);

    await expect(env.service.cancelEvent(ctx(), event.id, " ")).rejects.toThrow(
      ValidationFailedError,
    );

    const cancelled = await env.service.cancelEvent(ctx(), event.id, "Chuva forte prevista");
    expect(cancelled.status).toBe("CANCELLED");

    // terminal: no way back
    await expect(env.service.publishEvent(ctx(), event.id)).rejects.toThrow(ConflictError);
  });

  it("full happy path: published → closed → completed → archived", async () => {
    const env = setup();
    await withManager(env);
    const event = await publishedEvent(env);

    await env.service.closeSales(ctx(), event.id);
    await env.service.completeEvent(ctx(), event.id);
    const archived = await env.service.archiveEvent(ctx(), event.id);
    expect(archived.status).toBe("ARCHIVED");
  });

  it("postponed can return to published", async () => {
    const env = setup();
    await withManager(env);
    const event = await publishedEvent(env);

    await env.service.postponeEvent(ctx(), event.id, "Problema com a atração");
    const republished = await env.service.publishEvent(ctx(), event.id);
    expect(republished.status).toBe("PUBLISHED");
  });
});

describe("changeEventCapacity", () => {
  it("blocks reducing capacity below the committed total (BR-INV-004)", async () => {
    const env = setup();
    await withManager(env);
    const event = await env.service.createEvent(ctx(), completeEvent);
    const batch = await env.batches.create({
      organizationId: ORG,
      eventId: event.id,
      ticketTypeId: "tt",
      name: "Lote 1",
      priceCents: 5000,
      quantityTotal: 300,
    });
    batch.quantitySold = 200;
    batch.quantityReserved = 50;

    await expect(
      env.service.changeEventCapacity(ctx(), event.id, 100, "reduzindo por segurança"),
    ).rejects.toThrow(ConflictError);
  });

  it("blocks reducing capacity below the configured batch totals (FR-INV-004)", async () => {
    const env = setup();
    await withManager(env);
    const event = await env.service.createEvent(ctx(), completeEvent);
    await env.batches.create({
      organizationId: ORG,
      eventId: event.id,
      ticketTypeId: "tt",
      name: "Lote 1",
      priceCents: 5000,
      quantityTotal: 400,
    });

    await expect(
      env.service.changeEventCapacity(ctx(), event.id, 300, "reduzindo capacidade"),
    ).rejects.toThrow(ConflictError);
  });

  it("changes capacity with justification and audits before/after", async () => {
    const env = setup();
    await withManager(env);
    const event = await env.service.createEvent(ctx(), completeEvent);

    const updated = await env.service.changeEventCapacity(
      ctx(),
      event.id,
      800,
      "Liberação do corpo de bombeiros",
    );

    expect(updated.capacityTotal).toBe(800);
    const entry = env.audit.byAction("event.capacity_changed")[0];
    expect(entry?.before).toEqual({ capacityTotal: 500 });
    expect(entry?.after).toEqual({ capacityTotal: 800 });
  });
});

describe("tenant isolation", () => {
  it("org B manager cannot see or mutate org A events", async () => {
    const env = setup();
    await withManager(env);
    const event = await env.service.createEvent(ctx(), completeEvent);

    await env.memberships.create({
      organizationId: "org_B",
      userId: "user_b",
      role: "OWNER",
    });
    const ctxB = ctx("OWNER", "org_B", "user_b");

    await expect(env.service.getEvent(ctxB, event.id)).rejects.toThrow(NotFoundOrForbiddenError);
    await expect(
      env.service.updateEventDetails(ctxB, event.id, { title: "Hackeado" }),
    ).rejects.toThrow(NotFoundOrForbiddenError);
    await expect(
      env.service.changeEventCapacity(ctxB, event.id, 10_000, "capacidade indevida"),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });
});

describe("sectors", () => {
  it("rejects sector capacities that exceed the event capacity", async () => {
    const env = setup();
    await withManager(env);
    const event = await env.service.createEvent(ctx(), completeEvent);

    await env.service.createSector(ctx(), event.id, { name: "Pista", capacity: 400 });
    await expect(
      env.service.createSector(ctx(), event.id, { name: "Camarote", capacity: 200 }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects duplicate sector names", async () => {
    const env = setup();
    await withManager(env);
    const event = await env.service.createEvent(ctx(), completeEvent);

    await env.service.createSector(ctx(), event.id, { name: "Pista" });
    await expect(env.service.createSector(ctx(), event.id, { name: "Pista" })).rejects.toThrow(
      ConflictError,
    );
  });
});
