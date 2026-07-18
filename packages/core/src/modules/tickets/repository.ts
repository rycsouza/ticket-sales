import type { PrismaClient } from "@ingressos/db";
import type { TicketRecord, TicketStatus } from "./types";

export interface TicketRepository {
  /**
   * Creates a ticket for an order item. The UNIQUE constraint on orderItemId
   * is the duplication guard (FR-TKT-016): concurrent retries insert-race and
   * exactly one wins. Returns null when the item already has a ticket.
   */
  createForOrderItem(data: {
    organizationId: string;
    eventId: string;
    orderId: string;
    orderItemId: string;
    ticketTypeId: string;
    tokenHash: string;
    participantName?: string | undefined;
    participantEmail?: string | undefined;
  }): Promise<TicketRecord | null>;
  listByOrder(organizationId: string, orderId: string): Promise<TicketRecord[]>;
  findByIdScoped(organizationId: string, ticketId: string): Promise<TicketRecord | null>;
  findByTokenHash(tokenHash: string): Promise<TicketRecord | null>;
  /** BR-TKT-002: rotating the token invalidates every previous link/QR. */
  updateTokenHash(organizationId: string, ticketId: string, tokenHash: string): Promise<void>;
  /**
   * Guarded status transition: succeeds only when the current status is in
   * `from`. Returns false otherwise (idempotency primitive). Stamps the
   * matching timestamp column.
   */
  updateStatus(
    organizationId: string,
    ticketId: string,
    from: TicketStatus[],
    to: TicketStatus,
    fields?: { blockedAt?: Date; cancelledAt?: Date },
  ): Promise<boolean>;
  /** Non-financial participant data correction (FR-TKT-012). */
  updateParticipant(
    organizationId: string,
    ticketId: string,
    data: { participantName?: string | undefined; participantEmail?: string | undefined },
  ): Promise<void>;
  /** Bulk terminal transition for every non-terminal ticket of an order. */
  transitionOrderTickets(
    organizationId: string,
    orderId: string,
    from: TicketStatus[],
    to: TicketStatus,
    fields?: { cancelledAt?: Date },
  ): Promise<number>;
  /** Offline check-in pack (FR-CIN-011/012): only VALID tickets, minimal data. */
  listValidForEvent(
    organizationId: string,
    eventId: string,
  ): Promise<
    {
      id: string;
      tokenHash: string;
      ticketTypeId: string;
      participantName: string | null;
    }[]
  >;
  /** Count of tickets in the given statuses for an event (dashboard). */
  countByEventStatuses(
    organizationId: string,
    eventId: string,
    statuses: TicketStatus[],
  ): Promise<number>;
}

const ticketSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  orderId: true,
  orderItemId: true,
  ticketTypeId: true,
  status: true,
  tokenHash: true,
  participantName: true,
  participantEmail: true,
  issuedAt: true,
} as const;

export class PrismaTicketRepository implements TicketRepository {
  constructor(private readonly prisma: PrismaClient) {}

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
    try {
      return await this.prisma.ticket.create({
        data: {
          organizationId: data.organizationId,
          eventId: data.eventId,
          orderId: data.orderId,
          orderItemId: data.orderItemId,
          ticketTypeId: data.ticketTypeId,
          tokenHash: data.tokenHash,
          participantName: data.participantName ?? null,
          participantEmail: data.participantEmail ?? null,
        },
        select: ticketSelect,
      });
    } catch (error) {
      // P2002 = unique violation → another issuer won the race. That is the
      // idempotency working, not a failure.
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "P2002"
      ) {
        return null;
      }
      throw error;
    }
  }

  async listByOrder(organizationId: string, orderId: string) {
    return this.prisma.ticket.findMany({
      where: { organizationId, orderId },
      select: ticketSelect,
      orderBy: { issuedAt: "asc" },
    });
  }

  async findByIdScoped(organizationId: string, ticketId: string) {
    return this.prisma.ticket.findFirst({
      where: { id: ticketId, organizationId },
      select: ticketSelect,
    });
  }

  async findByTokenHash(tokenHash: string) {
    return this.prisma.ticket.findUnique({
      where: { tokenHash },
      select: ticketSelect,
    });
  }

  async updateTokenHash(organizationId: string, ticketId: string, tokenHash: string) {
    const result = await this.prisma.ticket.updateMany({
      where: { id: ticketId, organizationId },
      data: { tokenHash },
    });
    if (result.count === 0) throw new Error("Ticket not found in organization scope");
  }

  async updateStatus(
    organizationId: string,
    ticketId: string,
    from: TicketStatus[],
    to: TicketStatus,
    fields?: { blockedAt?: Date; cancelledAt?: Date },
  ): Promise<boolean> {
    const result = await this.prisma.ticket.updateMany({
      where: { id: ticketId, organizationId, status: { in: from } },
      data: {
        status: to,
        ...(fields?.blockedAt !== undefined ? { blockedAt: fields.blockedAt } : {}),
        ...(fields?.cancelledAt !== undefined ? { cancelledAt: fields.cancelledAt } : {}),
      },
    });
    return result.count > 0;
  }

  async updateParticipant(
    organizationId: string,
    ticketId: string,
    data: { participantName?: string | undefined; participantEmail?: string | undefined },
  ) {
    const result = await this.prisma.ticket.updateMany({
      where: { id: ticketId, organizationId },
      data: {
        ...(data.participantName !== undefined ? { participantName: data.participantName } : {}),
        ...(data.participantEmail !== undefined
          ? { participantEmail: data.participantEmail }
          : {}),
      },
    });
    if (result.count === 0) throw new Error("Ticket not found in organization scope");
  }

  async transitionOrderTickets(
    organizationId: string,
    orderId: string,
    from: TicketStatus[],
    to: TicketStatus,
    fields?: { cancelledAt?: Date },
  ): Promise<number> {
    const result = await this.prisma.ticket.updateMany({
      where: { organizationId, orderId, status: { in: from } },
      data: {
        status: to,
        ...(fields?.cancelledAt !== undefined ? { cancelledAt: fields.cancelledAt } : {}),
      },
    });
    return result.count;
  }

  async listValidForEvent(organizationId: string, eventId: string) {
    return this.prisma.ticket.findMany({
      where: { organizationId, eventId, status: "VALID" },
      select: { id: true, tokenHash: true, ticketTypeId: true, participantName: true },
      orderBy: { issuedAt: "asc" },
    });
  }

  async countByEventStatuses(
    organizationId: string,
    eventId: string,
    statuses: TicketStatus[],
  ): Promise<number> {
    return this.prisma.ticket.count({
      where: { organizationId, eventId, status: { in: statuses } },
    });
  }
}
