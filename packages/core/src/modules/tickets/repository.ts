import type { PrismaClient } from "@ingressos/db";
import type { TicketRecord } from "./types";

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
  findByTokenHash(tokenHash: string): Promise<TicketRecord | null>;
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

  async findByTokenHash(tokenHash: string) {
    return this.prisma.ticket.findUnique({
      where: { tokenHash },
      select: ticketSelect,
    });
  }
}
