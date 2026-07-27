import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NotFoundOrForbiddenError, ValidationFailedError } from "../../../shared/errors";
import { InMemoryAuditRepository, InMemoryMembershipRepository } from "../../../testing/fakes";
import type { RequestContext } from "../../../shared/context";
import { OffersService, type OfferBatchReader } from "../service";
import type { OfferRepository, ProductRepository } from "../repository";
import type { OfferKind, OfferRecord, ProductRecord } from "../types";

const ORG = "org_offers";
const EVENT = "11111111-1111-7111-8111-111111111111";
const OTHER_EVENT = "22222222-2222-7222-8222-222222222222";

const nextId = () => randomUUID();

class FakeProductRepo implements ProductRepository {
  rows: ProductRecord[] = [];
  async create(data: {
    organizationId: string;
    name: string;
    description?: string | undefined;
    priceCents: number;
  }): Promise<ProductRecord> {
    const row: ProductRecord = {
      id: nextId(),
      organizationId: data.organizationId,
      name: data.name,
      description: data.description ?? null,
      priceCents: data.priceCents,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
  async findById(organizationId: string, id: string) {
    return this.rows.find((r) => r.id === id && r.organizationId === organizationId) ?? null;
  }
  async listByOrganization(organizationId: string) {
    return this.rows.filter((r) => r.organizationId === organizationId);
  }
  async update(
    organizationId: string,
    id: string,
    data: {
      name?: string | undefined;
      description?: string | null | undefined;
      priceCents?: number | undefined;
      active?: boolean | undefined;
    },
  ) {
    const row = await this.findById(organizationId, id);
    if (!row) return null;
    Object.assign(row, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.priceCents !== undefined ? { priceCents: data.priceCents } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    });
    return row;
  }
}

class FakeOfferRepo implements OfferRepository {
  rows: OfferRecord[] = [];
  async create(data: {
    organizationId: string;
    kind: OfferKind;
    eventId?: string | null | undefined;
    batchId?: string | undefined;
    productId?: string | undefined;
    title?: string | undefined;
    description?: string | undefined;
    priceCentsOverride?: number | undefined;
    sortOrder?: number | undefined;
  }): Promise<OfferRecord> {
    const row: OfferRecord = {
      id: nextId(),
      organizationId: data.organizationId,
      eventId: data.eventId ?? null,
      kind: data.kind,
      batchId: data.batchId ?? null,
      productId: data.productId ?? null,
      title: data.title ?? null,
      description: data.description ?? null,
      priceCentsOverride: data.priceCentsOverride ?? null,
      active: true,
      sortOrder: data.sortOrder ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
  async findById(organizationId: string, id: string) {
    return this.rows.find((r) => r.id === id && r.organizationId === organizationId) ?? null;
  }
  async listByOrganization(organizationId: string) {
    return this.rows.filter((r) => r.organizationId === organizationId);
  }
  async listActiveForEvent(organizationId: string, eventId: string) {
    return this.rows.filter(
      (r) =>
        r.organizationId === organizationId &&
        r.active &&
        (r.eventId === eventId || r.eventId === null),
    );
  }
  async update(
    organizationId: string,
    id: string,
    data: {
      title?: string | null | undefined;
      description?: string | null | undefined;
      priceCentsOverride?: number | null | undefined;
      sortOrder?: number | undefined;
      active?: boolean | undefined;
    },
  ) {
    const row = await this.findById(organizationId, id);
    if (!row) return null;
    Object.assign(row, data);
    return row;
  }
}

class FakeBatchReader implements OfferBatchReader {
  constructor(
    private readonly batch: {
      id: string;
      eventId: string;
      ticketTypeId: string;
      status: string;
      priceCents: number;
      salesStartAt: Date | null;
      salesEndAt: Date | null;
    } | null,
  ) {}
  async findByIdScoped(_org: string, batchId: string) {
    return this.batch && this.batch.id === batchId ? this.batch : null;
  }
}

async function setup(batch?: Partial<Parameters<typeof makeBatch>[0]>) {
  const products = new FakeProductRepo();
  const offers = new FakeOfferRepo();
  const batchRow = makeBatch(batch);
  const batches = new FakeBatchReader(batchRow);
  const memberships = new InMemoryMembershipRepository();
  const audit = new InMemoryAuditRepository();
  const owner = await memberships.create({ organizationId: ORG, userId: "u_owner", role: "OWNER" });
  const service = new OffersService({ products, offers, batches, memberships, audit });
  const ctx: RequestContext = {
    organizationId: ORG,
    userId: owner.userId,
    role: "member",
    correlationId: "c1",
  };
  return { service, ctx, products, offers, batchRow };
}

function makeBatch(overrides?: Partial<{
  id: string;
  eventId: string;
  ticketTypeId: string;
  status: string;
  priceCents: number;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
}>) {
  return {
    id: "33333333-3333-7333-8333-333333333333",
    eventId: EVENT,
    ticketTypeId: "44444444-4444-7444-8444-444444444444",
    status: "OPEN",
    priceCents: 10_000,
    salesStartAt: null,
    salesEndAt: null,
    ...overrides,
  };
}

const now = new Date("2026-07-27T12:00:00Z");

describe("OffersService.resolveSelections", () => {
  it("prices a product offer server-side (override wins)", async () => {
    const { service, ctx, products, offers } = await setup();
    const product = await service.createProduct(ctx, { name: "Copo oficial", priceCents: 3_000 });
    const offer = await service.createOffer(ctx, {
      kind: "ORDER_BUMP",
      productId: product.id,
      priceCentsOverride: 2_500,
    });

    const resolved = await service.resolveSelections({
      organizationId: ORG,
      eventId: EVENT,
      selections: [{ offerId: offer.id, quantity: 2 }],
      now,
    });

    expect(resolved.ticketUnits).toHaveLength(0);
    expect(resolved.products).toHaveLength(2);
    expect(resolved.products[0]).toMatchObject({
      productId: product.id,
      description: "Copo oficial",
      unitPriceCents: 2_500, // override, NOT the client and NOT the base price
    });
    expect(products.rows).toHaveLength(1);
    expect(offers.rows).toHaveLength(1);
  });

  it("expands a ticket offer into reserved units at the offer price", async () => {
    const { service, ctx, batchRow } = await setup();
    const offer = await service.createOffer(ctx, {
      kind: "UPSELL",
      batchId: batchRow.id,
      priceCentsOverride: 8_000,
    });

    const resolved = await service.resolveSelections({
      organizationId: ORG,
      eventId: EVENT,
      selections: [{ offerId: offer.id, quantity: 3 }],
      now,
    });

    expect(resolved.products).toHaveLength(0);
    expect(resolved.ticketUnits).toHaveLength(3);
    expect(resolved.ticketUnits[0]).toMatchObject({
      batchId: batchRow.id,
      ticketTypeId: batchRow.ticketTypeId,
      unitPriceCents: 8_000,
    });
  });

  it("rejects an inactive offer", async () => {
    const { service, ctx, offers } = await setup();
    const product = await service.createProduct(ctx, { name: "Brinde", priceCents: 1_000 });
    const offer = await service.createOffer(ctx, { kind: "ORDER_BUMP", productId: product.id });
    await service.updateOffer(ctx, offer.id, { active: false });

    await expect(
      service.resolveSelections({
        organizationId: ORG,
        eventId: EVENT,
        selections: [{ offerId: offer.id, quantity: 1 }],
        now,
      }),
    ).rejects.toThrow(ValidationFailedError);
    expect(offers.rows[0]!.active).toBe(false);
  });

  it("rejects an offer scoped to another event", async () => {
    const { service, ctx } = await setup();
    const product = await service.createProduct(ctx, { name: "Brinde", priceCents: 1_000 });
    const offer = await service.createOffer(ctx, {
      kind: "ORDER_BUMP",
      productId: product.id,
      eventId: OTHER_EVENT,
    });

    await expect(
      service.resolveSelections({
        organizationId: ORG,
        eventId: EVENT,
        selections: [{ offerId: offer.id, quantity: 1 }],
        now,
      }),
    ).rejects.toThrow(ValidationFailedError);
  });

  it("rejects a ticket offer whose batch is no longer OPEN", async () => {
    const { service, ctx, batchRow } = await setup({ status: "CLOSED" });
    // Offer created against a batch that later closed: create writes eventId
    // from the batch; resolution must reject because it is not sellable now.
    const offer = await service.createOffer(ctx, { kind: "UPSELL", batchId: batchRow.id });

    await expect(
      service.resolveSelections({
        organizationId: ORG,
        eventId: EVENT,
        selections: [{ offerId: offer.id, quantity: 1 }],
        now,
      }),
    ).rejects.toThrow(ValidationFailedError);
  });
});

describe("OffersService offer creation", () => {
  it("binds a ticket offer to its batch's event and rejects unknown batches", async () => {
    const { service, ctx, batchRow } = await setup();
    const offer = await service.createOffer(ctx, { kind: "UPSELL", batchId: batchRow.id });
    expect(offer.eventId).toBe(EVENT); // derived from the batch, not the client

    await expect(
      service.createOffer(ctx, { kind: "UPSELL", batchId: "999e9999-9999-7999-8999-999999999999" }),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });

  it("lists only currently sellable offers for checkout", async () => {
    const { service, ctx, batchRow } = await setup();
    const product = await service.createProduct(ctx, { name: "Copo", priceCents: 3_000 });
    await service.createOffer(ctx, { kind: "ORDER_BUMP", productId: product.id });
    await service.createOffer(ctx, { kind: "UPSELL", batchId: batchRow.id });
    // An offer pointing to an inactive product must be hidden.
    const hidden = await service.createProduct(ctx, { name: "Esgotado", priceCents: 5_000 });
    await service.updateProduct(ctx, hidden.id, { active: false });
    await service.createOffer(ctx, { kind: "ORDER_BUMP", productId: hidden.id });

    const views = await service.listForCheckout(ORG, EVENT);
    expect(views).toHaveLength(2);
    const titles = views.map((v) => v.title).sort();
    expect(titles).toEqual(["Copo", "Ingresso adicional"]);
  });
});
