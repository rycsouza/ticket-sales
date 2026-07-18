// In-memory fakes for the sales engine. The reservation fake reproduces the
// EXACT conditional semantics of the SQL in reservations.ts (including
// all-or-nothing rollback), so unit tests exercise real invariants.

import {
  NoAvailabilityError,
  type ReservationRecord,
  type ReservationStore,
} from "../modules/inventory/reservations";
import type {
  CreatePendingOrderData,
  OrderRepository,
} from "../modules/orders/repository";
import type { OrderItemRecord, OrderRecord, OrderStatus } from "../modules/orders/types";
import type { TicketRepository } from "../modules/tickets/repository";
import type { TicketRecord } from "../modules/tickets/types";
import type { InMemorySalesBatchRepository } from "./fakes-events";
import { nextId } from "./fakes";

export class InMemoryReservationStore implements ReservationStore {
  readonly reservations: ReservationRecord[] = [];

  constructor(private readonly batchRepo: InMemorySalesBatchRepository) {}

  async reserveForOrder(input: {
    organizationId: string;
    eventId: string;
    orderId: string;
    expiresAt: Date;
    lines: { batchId: string; quantity: number }[];
  }): Promise<ReservationRecord[]> {
    const created: ReservationRecord[] = [];
    const incremented: { batchId: string; quantity: number }[] = [];

    for (const line of input.lines) {
      const batch = this.batchRepo.batches.find(
        (b) => b.id === line.batchId && b.organizationId === input.organizationId,
      );
      const fits =
        batch &&
        batch.status === "OPEN" &&
        batch.quantitySold + batch.quantityReserved + line.quantity <= batch.quantityTotal;

      if (!fits) {
        // "Transaction rollback": undo previous increments and drop rows
        for (const undo of incremented) {
          const b = this.batchRepo.batches.find((x) => x.id === undo.batchId);
          if (b) b.quantityReserved -= undo.quantity;
        }
        for (const row of created) {
          const index = this.reservations.indexOf(row);
          if (index >= 0) this.reservations.splice(index, 1);
        }
        throw new NoAvailabilityError(line.batchId);
      }

      batch.quantityReserved += line.quantity;
      incremented.push({ batchId: line.batchId, quantity: line.quantity });

      const reservation: ReservationRecord = {
        id: nextId("res"),
        organizationId: input.organizationId,
        eventId: input.eventId,
        batchId: line.batchId,
        orderId: input.orderId,
        status: "ACTIVE",
        quantity: line.quantity,
        expiresAt: input.expiresAt,
      };
      this.reservations.push(reservation);
      created.push(reservation);
    }
    return created;
  }

  async confirmForOrder(organizationId: string, orderId: string): Promise<number> {
    let confirmed = 0;
    for (const reservation of this.reservations) {
      if (
        reservation.organizationId !== organizationId ||
        reservation.orderId !== orderId ||
        reservation.status !== "ACTIVE"
      ) {
        continue;
      }
      reservation.status = "CONFIRMED";
      const batch = this.batchRepo.batches.find((b) => b.id === reservation.batchId);
      if (!batch || batch.quantityReserved < reservation.quantity) {
        throw new Error(`Inventory counters inconsistent for batch ${reservation.batchId}`);
      }
      batch.quantityReserved -= reservation.quantity;
      batch.quantitySold += reservation.quantity;
      if (batch.status === "OPEN" && batch.quantitySold >= batch.quantityTotal) {
        batch.status = "SOLD_OUT";
      }
      confirmed += 1;
    }
    return confirmed;
  }

  async releaseForOrder(
    organizationId: string,
    orderId: string,
    to: "RELEASED" | "EXPIRED",
  ): Promise<number> {
    let released = 0;
    for (const reservation of this.reservations) {
      if (
        reservation.organizationId !== organizationId ||
        reservation.orderId !== orderId ||
        reservation.status !== "ACTIVE"
      ) {
        continue;
      }
      reservation.status = to;
      const batch = this.batchRepo.batches.find((b) => b.id === reservation.batchId);
      if (!batch || batch.quantityReserved < reservation.quantity) {
        throw new Error(`Inventory counters inconsistent for batch ${reservation.batchId}`);
      }
      batch.quantityReserved -= reservation.quantity;
      released += 1;
    }
    return released;
  }

  async listOrdersWithDueReservations(now: Date, limit: number) {
    const seen = new Set<string>();
    const due: { organizationId: string; orderId: string }[] = [];
    for (const reservation of this.reservations) {
      if (
        reservation.status !== "ACTIVE" ||
        reservation.orderId === null ||
        reservation.expiresAt.getTime() > now.getTime() ||
        seen.has(reservation.orderId)
      ) {
        continue;
      }
      seen.add(reservation.orderId);
      due.push({ organizationId: reservation.organizationId, orderId: reservation.orderId });
      if (due.length >= limit) break;
    }
    return due;
  }
}

export class InMemoryOrderRepository implements OrderRepository {
  readonly orders: OrderRecord[] = [];
  readonly items: OrderItemRecord[] = [];

  constructor(private readonly reservations: InMemoryReservationStore) {}

  async createPendingOrder(data: CreatePendingOrderData): Promise<OrderRecord> {
    const order: OrderRecord = {
      id: nextId("ord"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      status: "AWAITING_PAYMENT",
      code: data.code,
      buyerName: data.buyerName,
      buyerEmail: data.buyerEmail,
      buyerDocument: data.buyerDocument ?? null,
      buyerPhone: data.buyerPhone ?? null,
      subtotalCents: data.subtotalCents,
      discountCents: data.discountCents,
      totalCents: data.totalCents,
      expiresAt: data.expiresAt,
      paidAt: null,
      correlationId: data.correlationId,
    };
    const items: OrderItemRecord[] = data.units.map((unit) => ({
      id: nextId("itm"),
      organizationId: data.organizationId,
      orderId: order.id,
      eventId: data.eventId,
      batchId: unit.batchId,
      ticketTypeId: unit.ticketTypeId,
      unitPriceCents: unit.unitPriceCents,
    }));

    // Same "transaction": if the reservation throws, nothing is persisted.
    const lines = new Map<string, number>();
    for (const unit of data.units) {
      lines.set(unit.batchId, (lines.get(unit.batchId) ?? 0) + 1);
    }
    await this.reservations.reserveForOrder({
      organizationId: data.organizationId,
      eventId: data.eventId,
      orderId: order.id,
      expiresAt: data.expiresAt,
      lines: [...lines.entries()].map(([batchId, quantity]) => ({ batchId, quantity })),
    });

    this.orders.push(order);
    this.items.push(...items);
    return order;
  }

  async findByIdScoped(organizationId: string, orderId: string) {
    return (
      this.orders.find((o) => o.id === orderId && o.organizationId === organizationId) ?? null
    );
  }

  async findByCode(code: string) {
    return this.orders.find((o) => o.code === code) ?? null;
  }

  async listItems(organizationId: string, orderId: string) {
    return this.items.filter(
      (item) => item.organizationId === organizationId && item.orderId === orderId,
    );
  }

  async transitionStatus(
    organizationId: string,
    orderId: string,
    from: OrderStatus[],
    to: OrderStatus,
    fields?: { paidAt?: Date; cancelledAt?: Date },
  ): Promise<boolean> {
    const order = await this.findByIdScoped(organizationId, orderId);
    if (!order || !from.includes(order.status)) return false;
    order.status = to;
    if (fields?.paidAt) order.paidAt = fields.paidAt;
    return true;
  }
}

export class InMemoryTicketRepository implements TicketRepository {
  readonly tickets: TicketRecord[] = [];

  async createForOrderItem(data: {
    organizationId: string;
    eventId: string;
    orderId: string;
    orderItemId: string;
    ticketTypeId: string;
    tokenHash: string;
    participantName?: string | undefined;
    participantEmail?: string | undefined;
  }): Promise<TicketRecord | null> {
    if (this.tickets.some((ticket) => ticket.orderItemId === data.orderItemId)) {
      return null; // unique constraint semantics
    }
    const ticket: TicketRecord = {
      id: nextId("tik"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      orderId: data.orderId,
      orderItemId: data.orderItemId,
      ticketTypeId: data.ticketTypeId,
      status: "VALID",
      tokenHash: data.tokenHash,
      participantName: data.participantName ?? null,
      participantEmail: data.participantEmail ?? null,
      issuedAt: new Date(),
    };
    this.tickets.push(ticket);
    return ticket;
  }

  async listByOrder(organizationId: string, orderId: string) {
    return this.tickets.filter(
      (ticket) => ticket.organizationId === organizationId && ticket.orderId === orderId,
    );
  }

  async findByTokenHash(tokenHash: string) {
    return this.tickets.find((ticket) => ticket.tokenHash === tokenHash) ?? null;
  }
}
