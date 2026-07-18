import type { PrismaClient } from "@ingressos/db";
import type { LedgerAccount, LedgerEntryRecord, LedgerEntryType } from "./types";

export interface LedgerPostEntry {
  account: LedgerAccount;
  type: LedgerEntryType;
  amountCents: number;
  membershipId?: string | undefined;
  memo?: string | undefined;
}

export interface LedgerRepository {
  /**
   * Posts a batch of entries for an order idempotently: the unique
   * (orderId, account, type) constraint means a duplicated call (webhook retry)
   * inserts nothing the second time. Returns the number of NEW rows written.
   */
  postForOrder(data: {
    organizationId: string;
    eventId: string;
    orderId: string;
    correlationId: string;
    entries: LedgerPostEntry[];
  }): Promise<number>;
  /** Appends a single non-order entry (PAYOUT / ADJUSTMENT) — never guarded. */
  append(data: {
    organizationId: string;
    eventId: string;
    account: LedgerAccount;
    type: LedgerEntryType;
    amountCents: number;
    membershipId?: string | undefined;
    memo?: string | undefined;
    correlationId: string;
  }): Promise<LedgerEntryRecord>;
  listByOrder(organizationId: string, orderId: string): Promise<LedgerEntryRecord[]>;
  listByEvent(organizationId: string, eventId: string): Promise<LedgerEntryRecord[]>;
}

const entrySelect = {
  id: true,
  organizationId: true,
  eventId: true,
  orderId: true,
  account: true,
  type: true,
  amountCents: true,
  membershipId: true,
  memo: true,
  createdAt: true,
} as const;

export class PrismaLedgerRepository implements LedgerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async postForOrder(data: {
    organizationId: string;
    eventId: string;
    orderId: string;
    correlationId: string;
    entries: LedgerPostEntry[];
  }): Promise<number> {
    if (data.entries.length === 0) return 0;
    // skipDuplicates makes the whole batch idempotent on (orderId, account, type).
    const result = await this.prisma.ledgerEntry.createMany({
      data: data.entries.map((e) => ({
        organizationId: data.organizationId,
        eventId: data.eventId,
        orderId: data.orderId,
        account: e.account,
        type: e.type,
        amountCents: e.amountCents,
        membershipId: e.membershipId ?? null,
        memo: e.memo ?? null,
        correlationId: data.correlationId,
      })),
      skipDuplicates: true,
    });
    return result.count;
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
    return this.prisma.ledgerEntry.create({
      data: {
        organizationId: data.organizationId,
        eventId: data.eventId,
        account: data.account,
        type: data.type,
        amountCents: data.amountCents,
        membershipId: data.membershipId ?? null,
        memo: data.memo ?? null,
        correlationId: data.correlationId,
      },
      select: entrySelect,
    });
  }

  async listByOrder(organizationId: string, orderId: string) {
    return this.prisma.ledgerEntry.findMany({
      where: { organizationId, orderId },
      select: entrySelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.prisma.ledgerEntry.findMany({
      where: { organizationId, eventId },
      select: entrySelect,
      orderBy: { createdAt: "asc" },
    });
  }
}
