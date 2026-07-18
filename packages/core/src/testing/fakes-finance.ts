import type { LedgerPostEntry, LedgerRepository } from "../modules/finance/repository";
import type { LedgerAccount, LedgerEntryRecord, LedgerEntryType } from "../modules/finance/types";
import { nextId } from "./fakes";

export class InMemoryLedgerRepository implements LedgerRepository {
  readonly entries: LedgerEntryRecord[] = [];

  async postForOrder(data: {
    organizationId: string;
    eventId: string;
    orderId: string;
    correlationId: string;
    entries: LedgerPostEntry[];
  }): Promise<number> {
    let written = 0;
    for (const e of data.entries) {
      // unique(orderId, account, type) — skip duplicates
      const clash = this.entries.some(
        (x) => x.orderId === data.orderId && x.account === e.account && x.type === e.type,
      );
      if (clash) continue;
      this.entries.push({
        id: nextId("led"),
        organizationId: data.organizationId,
        eventId: data.eventId,
        orderId: data.orderId,
        account: e.account,
        type: e.type,
        amountCents: e.amountCents,
        membershipId: e.membershipId ?? null,
        memo: e.memo ?? null,
        createdAt: new Date(),
      });
      written += 1;
    }
    return written;
  }

  async append(data: {
    organizationId: string;
    eventId: string;
    account: LedgerAccount;
    type: LedgerEntryType;
    amountCents: number;
    membershipId?: string | undefined;
    memo?: string | undefined;
    correlationId: string;
  }): Promise<LedgerEntryRecord> {
    const record: LedgerEntryRecord = {
      id: nextId("led"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      orderId: null,
      account: data.account,
      type: data.type,
      amountCents: data.amountCents,
      membershipId: data.membershipId ?? null,
      memo: data.memo ?? null,
      createdAt: new Date(),
    };
    this.entries.push(record);
    return record;
  }

  async listByOrder(organizationId: string, orderId: string) {
    return this.entries.filter(
      (e) => e.organizationId === organizationId && e.orderId === orderId,
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.entries.filter(
      (e) => e.organizationId === organizationId && e.eventId === eventId,
    );
  }
}
