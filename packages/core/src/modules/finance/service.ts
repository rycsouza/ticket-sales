import type { RequestContext } from "../../shared/context";
import { NotFoundOrForbiddenError, ValidationFailedError } from "../../shared/errors";
import type { AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import type { LedgerPostEntry, LedgerRepository } from "./repository";
import {
  FINANCE_ROLES,
  type EventFinancialSummary,
  type LedgerAccount,
  type LedgerEntryRecord,
} from "./types";

/** Narrow readers — finance never writes other modules' tables. */
export interface LedgerOrderReader {
  findByIdScoped(
    organizationId: string,
    orderId: string,
  ): Promise<{
    id: string;
    eventId: string;
    status: string;
    subtotalCents: number;
    discountCents: number;
    feeCents: number;
    feeMode: "BUYER" | "PRODUCER";
  } | null>;
}
export interface LedgerEventReader {
  findByIdScoped(
    organizationId: string,
    eventId: string,
  ): Promise<{ id: string } | null>;
}
export interface LedgerCommissionReader {
  getAccruedCommission(
    organizationId: string,
    orderId: string,
  ): Promise<{ promoterId: string; amountCents: number } | null>;
}
export interface LedgerPspCostReader {
  getOrderPspCostCents(organizationId: string, orderId: string): Promise<number>;
}

export interface FinanceServiceDeps {
  ledger: LedgerRepository;
  orders: LedgerOrderReader;
  events: LedgerEventReader;
  commission: LedgerCommissionReader;
  pspCost: LedgerPspCostReader;
  memberships: MembershipLookup;
  audit: AuditRepository;
}

export class FinanceService {
  constructor(private readonly deps: FinanceServiceDeps) {}

  /**
   * Posts the ledger entries for a PAID order (FR-FIN-001/002). Idempotent via
   * the unique (orderId, account, type) constraint. Called by the fulfiller
   * AFTER commission accrual so the commission is known.
   *
   * Accounting (DEC-003):
   *   PRODUCER  +SALE(gross) −DISCOUNT −FEE(if PRODUCER mode) −COMMISSION
   *   PLATFORM  +FEE −PSP_COST
   *   PROMOTER  +COMMISSION
   */
  async postForPaidOrder(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<void> {
    const order = await this.deps.orders.findByIdScoped(organizationId, orderId);
    if (!order || order.status !== "PAID") return;

    const commission = await this.deps.commission.getAccruedCommission(organizationId, orderId);
    const pspCostCents = await this.deps.pspCost.getOrderPspCostCents(organizationId, orderId);

    const entries: LedgerPostEntry[] = [
      { account: "PRODUCER", type: "SALE", amountCents: order.subtotalCents },
    ];
    if (order.discountCents > 0) {
      entries.push({ account: "PRODUCER", type: "DISCOUNT", amountCents: -order.discountCents });
    }
    if (order.feeCents > 0) {
      entries.push({ account: "PLATFORM", type: "FEE", amountCents: order.feeCents });
      if (order.feeMode === "PRODUCER") {
        entries.push({ account: "PRODUCER", type: "FEE", amountCents: -order.feeCents });
      }
    }
    if (pspCostCents > 0) {
      entries.push({ account: "PLATFORM", type: "PSP_COST", amountCents: -pspCostCents });
    }
    if (commission && commission.amountCents > 0) {
      entries.push({
        account: "PRODUCER",
        type: "COMMISSION",
        amountCents: -commission.amountCents,
        promoterId: commission.promoterId,
      });
      entries.push({
        account: "PROMOTER",
        type: "COMMISSION",
        amountCents: commission.amountCents,
        promoterId: commission.promoterId,
      });
    }

    await this.deps.ledger.postForOrder({
      organizationId,
      eventId: order.eventId,
      orderId,
      correlationId: meta.correlationId,
      entries,
    });
  }

  /**
   * Reverses an order on refund/chargeback (FR-FIN-007): posts a compensating
   * REFUND entry per account equal to the negation of that account's balance,
   * so every account nets to zero for the order. Idempotent.
   */
  async reverseForOrder(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<void> {
    const existing = await this.deps.ledger.listByOrder(organizationId, orderId);
    if (existing.length === 0) return;

    const balances = new Map<LedgerAccount, { amount: number; promoterId: string | null }>();
    for (const entry of existing) {
      if (entry.type === "REFUND") return; // already reversed (idempotent)
      const current = balances.get(entry.account) ?? { amount: 0, promoterId: null };
      current.amount += entry.amountCents;
      if (entry.promoterId) current.promoterId = entry.promoterId;
      balances.set(entry.account, current);
    }

    const entries: LedgerPostEntry[] = [];
    for (const [account, { amount, promoterId }] of balances) {
      if (amount === 0) continue;
      entries.push({
        account,
        type: "REFUND",
        amountCents: -amount,
        ...(promoterId ? { promoterId } : {}),
        memo: "reversal",
      });
    }

    await this.deps.ledger.postForOrder({
      organizationId,
      eventId: existing[0]!.eventId,
      orderId,
      correlationId: meta.correlationId,
      entries,
    });
  }

  // -------------------------------------------------------------------------
  // Staff reads / manual payout (FINANCE_ROLES) — FR-FIN-003/008/010/013
  // -------------------------------------------------------------------------

  async getOrderLedger(ctx: RequestContext, orderId: string): Promise<LedgerEntryRecord[]> {
    await requireActiveRole(this.deps.memberships, ctx, FINANCE_ROLES);
    const order = await this.deps.orders.findByIdScoped(ctx.organizationId, orderId);
    if (!order) throw new NotFoundOrForbiddenError();
    return this.deps.ledger.listByOrder(ctx.organizationId, orderId);
  }

  async getEventFinancialSummary(
    ctx: RequestContext,
    eventId: string,
  ): Promise<EventFinancialSummary> {
    await requireActiveRole(this.deps.memberships, ctx, FINANCE_ROLES);
    const event = await this.deps.events.findByIdScoped(ctx.organizationId, eventId);
    if (!event) throw new NotFoundOrForbiddenError();

    const entries = await this.deps.ledger.listByEvent(ctx.organizationId, eventId);
    const sum = (predicate: (e: LedgerEntryRecord) => boolean): number =>
      entries.filter(predicate).reduce((acc, e) => acc + e.amountCents, 0);

    const producerPayableCents = sum((e) => e.account === "PRODUCER");
    const platformNetCents = sum((e) => e.account === "PLATFORM");
    const promoterPayableCents = sum((e) => e.account === "PROMOTER");

    return {
      eventId,
      grossSalesCents: sum((e) => e.type === "SALE"),
      discountCents: -sum((e) => e.type === "DISCOUNT"),
      platformFeeCents: sum((e) => e.account === "PLATFORM" && e.type === "FEE"),
      pspCostCents: -sum((e) => e.type === "PSP_COST"),
      commissionCents: sum((e) => e.account === "PROMOTER" && e.type === "COMMISSION"),
      refundedCents: -sum((e) => e.account === "PRODUCER" && e.type === "REFUND"),
      producerPayableCents,
      platformNetCents,
      promoterPayableCents,
      payoutsCents: -sum((e) => e.type === "PAYOUT"),
    };
  }

  /** FR-FIN-009 — event ledger for CSV export; the read is audited. */
  async getEventLedgerForExport(
    ctx: RequestContext,
    eventId: string,
  ): Promise<LedgerEntryRecord[]> {
    await requireActiveRole(this.deps.memberships, ctx, FINANCE_ROLES);
    const event = await this.deps.events.findByIdScoped(ctx.organizationId, eventId);
    if (!event) throw new NotFoundOrForbiddenError();
    const entries = await this.deps.ledger.listByEvent(ctx.organizationId, eventId);
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "finance.ledger_exported",
      resourceType: "event",
      resourceId: eventId,
      after: { count: entries.length },
      correlationId: ctx.correlationId,
    });
    return entries;
  }

  /**
   * FR-FIN-013 — register a payout executed EXTERNALLY (manual in the MVP). No
   * money moves here; it records the fact against the producer account with
   * evidence, for reconciliation and audit.
   */
  async registerExternalPayout(
    ctx: RequestContext,
    eventId: string,
    input: { amountCents: number; memo: string },
  ): Promise<LedgerEntryRecord> {
    await requireActiveRole(this.deps.memberships, ctx, FINANCE_ROLES);
    const event = await this.deps.events.findByIdScoped(ctx.organizationId, eventId);
    if (!event) throw new NotFoundOrForbiddenError();

    return this.deps.ledger.append({
      organizationId: ctx.organizationId,
      eventId,
      account: "PRODUCER",
      type: "PAYOUT",
      amountCents: -Math.abs(input.amountCents),
      memo: input.memo,
      correlationId: ctx.correlationId,
    });
  }

  /**
   * Outstanding commission owed to each promoter for an event — the PROMOTER
   * account balance per promoter (accrued − reversed − paid). Only promoters
   * with a positive balance are returned.
   */
  async getEventPromoterPayables(
    ctx: RequestContext,
    eventId: string,
  ): Promise<{ promoterId: string; owedCents: number }[]> {
    await requireActiveRole(this.deps.memberships, ctx, FINANCE_ROLES);
    const event = await this.deps.events.findByIdScoped(ctx.organizationId, eventId);
    if (!event) throw new NotFoundOrForbiddenError();

    const entries = await this.deps.ledger.listByEvent(ctx.organizationId, eventId);
    const owed = new Map<string, number>();
    for (const e of entries) {
      if (e.account !== "PROMOTER" || !e.promoterId) continue;
      owed.set(e.promoterId, (owed.get(e.promoterId) ?? 0) + e.amountCents);
    }
    return [...owed.entries()]
      .filter(([, cents]) => cents > 0)
      .map(([promoterId, owedCents]) => ({ promoterId, owedCents }));
  }

  /**
   * Registers a promoter commission payout executed EXTERNALLY (FR-FIN-013).
   * Guards against over-payout: the amount may not exceed the promoter's
   * outstanding balance. Posts a PROMOTER PAYOUT entry (append-only ledger).
   */
  async registerPromoterPayout(
    ctx: RequestContext,
    eventId: string,
    input: { promoterId: string; amountCents: number; memo?: string | undefined },
  ): Promise<LedgerEntryRecord> {
    await requireActiveRole(this.deps.memberships, ctx, FINANCE_ROLES);
    const event = await this.deps.events.findByIdScoped(ctx.organizationId, eventId);
    if (!event) throw new NotFoundOrForbiddenError();

    const entries = await this.deps.ledger.listByEvent(ctx.organizationId, eventId);
    const owed = entries
      .filter((e) => e.account === "PROMOTER" && e.promoterId === input.promoterId)
      .reduce((acc, e) => acc + e.amountCents, 0);

    const amount = Math.abs(input.amountCents);
    if (amount <= 0 || amount > owed) {
      throw new ValidationFailedError("Valor acima do saldo de comissão devido ao promotor");
    }

    const posted = await this.deps.ledger.append({
      organizationId: ctx.organizationId,
      eventId,
      account: "PROMOTER",
      type: "PAYOUT",
      amountCents: -amount,
      promoterId: input.promoterId,
      memo: input.memo,
      correlationId: ctx.correlationId,
    });
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "finance.promoter_payout",
      resourceType: "event",
      resourceId: eventId,
      after: { promoterId: input.promoterId, amountCents: amount },
      correlationId: ctx.correlationId,
    });
    return posted;
  }
}
