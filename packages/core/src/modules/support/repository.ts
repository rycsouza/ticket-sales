import type { PrismaClient } from "@ingressos/db";
import type { OrderNoteRecord } from "./types";

export interface OrderNoteRepository {
  create(data: {
    organizationId: string;
    orderId: string;
    authorUserId: string;
    body: string;
  }): Promise<OrderNoteRecord>;
  listByOrder(organizationId: string, orderId: string): Promise<OrderNoteRecord[]>;
}

const noteSelect = {
  id: true,
  organizationId: true,
  orderId: true,
  authorUserId: true,
  body: true,
  createdAt: true,
} as const;

export class PrismaOrderNoteRepository implements OrderNoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    orderId: string;
    authorUserId: string;
    body: string;
  }) {
    return this.prisma.orderNote.create({ data, select: noteSelect });
  }

  async listByOrder(organizationId: string, orderId: string) {
    return this.prisma.orderNote.findMany({
      where: { organizationId, orderId },
      select: noteSelect,
      orderBy: { createdAt: "asc" },
    });
  }
}
