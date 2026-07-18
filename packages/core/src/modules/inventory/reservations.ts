import type { PrismaClient } from "@ingressos/db";
import { ConflictError } from "../../shared/errors";

/**
 * Atomic inventory holds (ARQUITETURA §8, FR-INV-005..008, BR-INV-001..003).
 *
 * The ONLY way batch counters move is through the conditional SQL in this
 * store — a reservation exists if and only if the counters were incremented,
 * inside the same transaction. No application-level locks: correctness comes
 * from single-statement atomicity in Postgres, which serverless cannot break.
 */

export type ReservationStatus = "ACTIVE" | "CONFIRMED" | "RELEASED" | "EXPIRED";

export interface ReservationRecord {
  id: string;
  organizationId: string;
  eventId: string;
  batchId: string;
  orderId: string | null;
  status: ReservationStatus;
  quantity: number;
  expiresAt: Date;
}

export class NoAvailabilityError extends ConflictError {
  constructor(batchId: string) {
    super(`No availability left in batch ${batchId}`);
  }
}

export interface ReservationStore {
  /**
   * Atomically reserves units across the given batches and records the
   * reservations, all-or-nothing: if ANY batch lacks availability the whole
   * operation rolls back and NoAvailabilityError is thrown.
   */
  reserveForOrder(input: {
    organizationId: string;
    eventId: string;
    orderId: string;
    expiresAt: Date;
    lines: { batchId: string; quantity: number }[];
  }): Promise<ReservationRecord[]>;

  /**
   * ACTIVE → CONFIRMED for every reservation of the order, moving counters
   * reserved → sold. Idempotent: already-confirmed reservations are skipped.
   * Returns how many reservations were confirmed now.
   */
  confirmForOrder(organizationId: string, orderId: string): Promise<number>;

  /**
   * ACTIVE → RELEASED|EXPIRED for every reservation of the order, returning
   * units to availability exactly once (BR-INV-003/FR-INV-007). Idempotent.
   */
  releaseForOrder(
    organizationId: string,
    orderId: string,
    to: "RELEASED" | "EXPIRED",
  ): Promise<number>;

  /** Orders whose ACTIVE reservations are past their expiry (sweep input). */
  listOrdersWithDueReservations(now: Date, limit: number): Promise<
    { organizationId: string; orderId: string }[]
  >;
}

// ---------------------------------------------------------------------------
// Prisma implementation — raw conditional SQL, always parameterized
// ---------------------------------------------------------------------------

/** Works with either the root client or a transaction-bound client. */
type Db = Pick<PrismaClient, "$executeRaw"> & {
  inventoryReservation: PrismaClient["inventoryReservation"];
};

/**
 * Reserve units WITHOUT opening a transaction — the caller supplies one, so
 * order creation and reservation share the same all-or-nothing boundary.
 */
export async function reserveOrderLines(
  db: Db,
  input: {
    organizationId: string;
    eventId: string;
    orderId: string;
    expiresAt: Date;
    lines: { batchId: string; quantity: number }[];
  },
): Promise<ReservationRecord[]> {
  const reservations: ReservationRecord[] = [];
  for (const line of input.lines) {
    // The invariant lives HERE: the increment only happens when the new
    // committed total still fits quantityTotal, in one atomic statement.
    const updated = await db.$executeRaw`
      UPDATE "SalesBatch"
         SET "quantityReserved" = "quantityReserved" + ${line.quantity},
             "updatedAt" = now()
       WHERE "id" = ${line.batchId}
         AND "organizationId" = ${input.organizationId}
         AND "status" = 'OPEN'::"SalesBatchStatus"
         AND ("quantitySold" + "quantityReserved" + ${line.quantity}) <= "quantityTotal"
    `;
    if (updated === 0) {
      // Rolls back every previous increment in the caller's transaction.
      throw new NoAvailabilityError(line.batchId);
    }
    const reservation = await db.inventoryReservation.create({
      data: {
        organizationId: input.organizationId,
        eventId: input.eventId,
        batchId: line.batchId,
        orderId: input.orderId,
        quantity: line.quantity,
        expiresAt: input.expiresAt,
      },
    });
    reservations.push(reservation as ReservationRecord);
  }
  return reservations;
}

/**
 * Under an on-sale rush, dozens of transactions queue on the same batch row
 * lock. Prisma's defaults (maxWait 2s) would reject queued buyers that WOULD
 * get a unit — losing sales without protecting anything. These limits let a
 * burst drain instead (NFR-PER-007); the row lock itself stays brief.
 */
export const RESERVATION_TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;
const TX_OPTIONS = RESERVATION_TX_OPTIONS;

export class PrismaReservationStore implements ReservationStore {
  constructor(private readonly prisma: PrismaClient) {}

  async reserveForOrder(input: {
    organizationId: string;
    eventId: string;
    orderId: string;
    expiresAt: Date;
    lines: { batchId: string; quantity: number }[];
  }): Promise<ReservationRecord[]> {
    return this.prisma.$transaction((tx) => reserveOrderLines(tx, input), TX_OPTIONS);
  }

  async confirmForOrder(organizationId: string, orderId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.inventoryReservation.findMany({
        where: { organizationId, orderId, status: "ACTIVE" },
        select: { id: true, batchId: true, quantity: true },
      });

      let confirmed = 0;
      for (const reservation of active) {
        // Guarded status transition — only ONE caller wins per reservation.
        const claimed = await tx.inventoryReservation.updateMany({
          where: { id: reservation.id, status: "ACTIVE" },
          data: { status: "CONFIRMED" },
        });
        if (claimed.count === 0) continue;

        const moved = await tx.$executeRaw`
          UPDATE "SalesBatch"
             SET "quantityReserved" = "quantityReserved" - ${reservation.quantity},
                 "quantitySold" = "quantitySold" + ${reservation.quantity},
                 "updatedAt" = now()
           WHERE "id" = ${reservation.batchId}
             AND "organizationId" = ${organizationId}
             AND "quantityReserved" >= ${reservation.quantity}
        `;
        if (moved === 0) {
          // Counters and reservations out of sync — never continue silently.
          throw new Error(
            `Inventory counters inconsistent for batch ${reservation.batchId}`,
          );
        }

        // Batch fully sold → flip to SOLD_OUT (auto transition, PRD §11)
        await tx.$executeRaw`
          UPDATE "SalesBatch"
             SET "status" = 'SOLD_OUT'::"SalesBatchStatus",
                 "updatedAt" = now()
           WHERE "id" = ${reservation.batchId}
             AND "organizationId" = ${organizationId}
             AND "status" = 'OPEN'::"SalesBatchStatus"
             AND "quantitySold" >= "quantityTotal"
        `;
        confirmed += 1;
      }
      return confirmed;
    }, TX_OPTIONS);
  }

  async releaseForOrder(
    organizationId: string,
    orderId: string,
    to: "RELEASED" | "EXPIRED",
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.inventoryReservation.findMany({
        where: { organizationId, orderId, status: "ACTIVE" },
        select: { id: true, batchId: true, quantity: true },
      });

      let released = 0;
      for (const reservation of active) {
        const claimed = await tx.inventoryReservation.updateMany({
          where: { id: reservation.id, status: "ACTIVE" },
          data: { status: to },
        });
        if (claimed.count === 0) continue;

        const moved = await tx.$executeRaw`
          UPDATE "SalesBatch"
             SET "quantityReserved" = "quantityReserved" - ${reservation.quantity},
                 "updatedAt" = now()
           WHERE "id" = ${reservation.batchId}
             AND "organizationId" = ${organizationId}
             AND "quantityReserved" >= ${reservation.quantity}
        `;
        if (moved === 0) {
          throw new Error(
            `Inventory counters inconsistent for batch ${reservation.batchId}`,
          );
        }
        released += 1;
      }
      return released;
    }, TX_OPTIONS);
  }

  async listOrdersWithDueReservations(now: Date, limit: number) {
    const due = await this.prisma.inventoryReservation.findMany({
      where: { status: "ACTIVE", expiresAt: { lte: now }, orderId: { not: null } },
      select: { organizationId: true, orderId: true },
      distinct: ["orderId"],
      take: limit,
    });
    return due.map((row) => ({
      organizationId: row.organizationId,
      orderId: row.orderId as string,
    }));
  }
}
