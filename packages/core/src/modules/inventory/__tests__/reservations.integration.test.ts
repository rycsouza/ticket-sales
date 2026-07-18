/**
 * Integration test against the REAL Postgres (Neon): fires concurrent
 * single-unit reservations at a batch and proves the conditional-UPDATE
 * invariant holds — zero overselling (DoD §22.3, NFR-PER-007, BR-INV-001).
 *
 * Skipped automatically when DATABASE_URL is not configured (e.g. CI without
 * secrets). Test data is isolated in its own throwaway organization.
 */
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrisma, type PrismaClient } from "@ingressos/db";
import { PrismaReservationStore } from "../reservations";

loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });

const DATABASE_URL = process.env.DATABASE_URL;

const CAPACITY = 30;
const ATTEMPTS = 60;

describe.skipIf(!DATABASE_URL)("PrismaReservationStore against real Postgres", () => {
  let prisma: PrismaClient;
  let store: PrismaReservationStore;
  let organizationId: string;
  let eventId: string;
  let batchId: string;

  beforeAll(async () => {
    prisma = getPrisma(DATABASE_URL as string);
    store = new PrismaReservationStore(prisma);

    const org = await prisma.organization.create({
      data: { name: `itest-concurrency-${Date.now()}` },
    });
    organizationId = org.id;

    const event = await prisma.event.create({
      data: {
        organizationId,
        title: "Evento Teste Concorrência",
        slug: `itest-${Date.now()}`,
        capacityTotal: CAPACITY,
        status: "PUBLISHED",
      },
    });
    eventId = event.id;

    const ticketType = await prisma.ticketType.create({
      data: { organizationId, eventId, name: "Inteira", kind: "FULL" },
    });
    const batch = await prisma.salesBatch.create({
      data: {
        organizationId,
        eventId,
        ticketTypeId: ticketType.id,
        name: "Lote Teste",
        priceCents: 1000,
        quantityTotal: CAPACITY,
        status: "OPEN",
      },
    });
    batchId = batch.id;
  }, 60_000);

  afterAll(async () => {
    // Cleanup in dependency order — this org is exclusively test data
    await prisma.inventoryReservation.deleteMany({ where: { organizationId } });
    await prisma.salesBatch.deleteMany({ where: { organizationId } });
    await prisma.ticketType.deleteMany({ where: { organizationId } });
    await prisma.event.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  }, 60_000);

  it(
    `${ATTEMPTS} concurrent 1-unit reservations never exceed capacity ${CAPACITY}`,
    async () => {
      const results = await Promise.allSettled(
        Array.from({ length: ATTEMPTS }, (_, i) =>
          store.reserveForOrder({
            organizationId,
            eventId,
            orderId: `itest-order-${i}`,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            lines: [{ batchId, quantity: 1 }],
          }),
        ),
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      expect(succeeded).toBe(CAPACITY);
      expect(failed).toBe(ATTEMPTS - CAPACITY);

      // The database agrees: counters and reservation rows match exactly
      const batch = await prisma.salesBatch.findUniqueOrThrow({ where: { id: batchId } });
      expect(batch.quantityReserved).toBe(CAPACITY);
      expect(batch.quantitySold).toBe(0);

      const reservationCount = await prisma.inventoryReservation.count({
        where: { organizationId, batchId, status: "ACTIVE" },
      });
      expect(reservationCount).toBe(CAPACITY);
    },
    120_000,
  );

  it("release returns units exactly once even when called twice", async () => {
    const first = await store.releaseForOrder(organizationId, "itest-order-0", "EXPIRED");
    const second = await store.releaseForOrder(organizationId, "itest-order-0", "EXPIRED");
    expect(first).toBe(1);
    expect(second).toBe(0);

    const batch = await prisma.salesBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.quantityReserved).toBe(CAPACITY - 1);
  }, 60_000);

  it("confirm moves reserved → sold exactly once", async () => {
    const first = await store.confirmForOrder(organizationId, "itest-order-1");
    const second = await store.confirmForOrder(organizationId, "itest-order-1");
    expect(first).toBe(1);
    expect(second).toBe(0);

    const batch = await prisma.salesBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.quantitySold).toBe(1);
    expect(batch.quantityReserved).toBe(CAPACITY - 2);
  }, 60_000);
});
