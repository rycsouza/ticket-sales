import type { OrderNoteRepository } from "../modules/support/repository";
import type { OrderNoteRecord } from "../modules/support/types";
import { nextId } from "./fakes";

export class InMemoryOrderNoteRepository implements OrderNoteRepository {
  readonly notes: OrderNoteRecord[] = [];

  async create(data: {
    organizationId: string;
    orderId: string;
    authorUserId: string;
    body: string;
  }) {
    const record: OrderNoteRecord = {
      id: nextId("note"),
      organizationId: data.organizationId,
      orderId: data.orderId,
      authorUserId: data.authorUserId,
      body: data.body,
      createdAt: new Date(),
    };
    this.notes.push(record);
    return record;
  }

  async listByOrder(organizationId: string, orderId: string) {
    return this.notes.filter(
      (n) => n.organizationId === organizationId && n.orderId === orderId,
    );
  }
}
