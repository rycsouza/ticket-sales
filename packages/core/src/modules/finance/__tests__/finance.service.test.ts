import { describe, expect, it } from "vitest";
import { NotFoundOrForbiddenError } from "../../../shared/errors";
import type { RequestContext } from "../../../shared/context";
import { InMemoryMembershipRepository } from "../../../testing/fakes";
import { InMemoryLedgerRepository } from "../../../testing/fakes-finance";
import { FinanceService } from "../service";
import type {
  LedgerCommissionReader,
  LedgerEventReader,
  LedgerOrderReader,
  LedgerPspCostReader,
} from "../service";

const ORG = "org_fin";
const EVENT = "evt_1";
const ORDER = "ord_1";
const PROMOTER = "mem_promo";

interface OrderShape {
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  feeMode: "BUYER" | "PRODUCER";
  status?: string;
}

function build(order: OrderShape, commissionCents = 0, pspCostCents = 0) {
  const ledger = new InMemoryLedgerRepository();
  const memberships = new InMemoryMembershipRepository();

  const orders: LedgerOrderReader = {
    findByIdScoped: async () => ({
      id: ORDER,
      eventId: EVENT,
      status: order.status ?? "PAID",
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      feeCents: order.feeCents,
      feeMode: order.feeMode,
    }),
  };
  const events: LedgerEventReader = { findByIdScoped: async () => ({ id: EVENT }) };
  const commission: LedgerCommissionReader = {
    getAccruedCommission: async () =>
      commissionCents > 0 ? { membershipId: PROMOTER, amountCents: commissionCents } : null,
  };
  const pspCost: LedgerPspCostReader = { getOrderPspCostCents: async () => pspCostCents };

  const service = new FinanceService({ ledger, orders, events, commission, pspCost, memberships });
  return { ledger, memberships, service };
}

function balances(ledger: InMemoryLedgerRepository) {
  const acc = { PRODUCER: 0, PLATFORM: 0, PROMOTER: 0 };
  for (const e of ledger.entries) acc[e.account] += e.amountCents;
  return acc;
}

describe("postForPaidOrder — accounting & conservation (DEC-003)", () => {
  it("PRODUCER mode: fee deducted from producer; money conserved", async () => {
    // buyer pays net = 20000; fee 2000 (10%); commission 500
    const { ledger, service } = build(
      { subtotalCents: 20_000, discountCents: 0, feeCents: 2_000, feeMode: "PRODUCER" },
      500,
    );
    await service.postForPaidOrder(ORG, ORDER, { correlationId: "c" });

    const b = balances(ledger);
    expect(b.PRODUCER).toBe(17_500); // 20000 − 2000 fee − 500 commission
    expect(b.PLATFORM).toBe(2_000);
    expect(b.PROMOTER).toBe(500);
    // conservation: disbursed = buyer paid (net)
    expect(b.PRODUCER + b.PLATFORM + b.PROMOTER).toBe(20_000);
  });

  it("BUYER mode: fee is buyer-funded, not deducted from producer", async () => {
    const { ledger, service } = build(
      { subtotalCents: 20_000, discountCents: 0, feeCents: 2_000, feeMode: "BUYER" },
      500,
    );
    await service.postForPaidOrder(ORG, ORDER, { correlationId: "c" });

    const b = balances(ledger);
    expect(b.PRODUCER).toBe(19_500); // 20000 − 500 commission (no fee debit)
    expect(b.PLATFORM).toBe(2_000);
    expect(b.PROMOTER).toBe(500);
    // conservation: disbursed = buyer paid (net + fee)
    expect(b.PRODUCER + b.PLATFORM + b.PROMOTER).toBe(22_000);
  });

  it("PSP cost reduces platform net", async () => {
    const { ledger, service } = build(
      { subtotalCents: 10_000, discountCents: 0, feeCents: 1_000, feeMode: "PRODUCER" },
      0,
      150,
    );
    await service.postForPaidOrder(ORG, ORDER, { correlationId: "c" });
    expect(balances(ledger).PLATFORM).toBe(850); // 1000 fee − 150 psp
  });

  it("records discount as its own entry", async () => {
    const { ledger, service } = build({
      subtotalCents: 20_000,
      discountCents: 4_000,
      feeCents: 1_600,
      feeMode: "PRODUCER",
    });
    await service.postForPaidOrder(ORG, ORDER, { correlationId: "c" });
    const discount = ledger.entries.find((e) => e.type === "DISCOUNT");
    expect(discount?.amountCents).toBe(-4_000);
    // producer = 20000 − 4000 − 1600 = 14400
    expect(balances(ledger).PRODUCER).toBe(14_400);
  });

  it("is idempotent — a duplicated posting writes nothing new", async () => {
    const { ledger, service } = build(
      { subtotalCents: 10_000, discountCents: 0, feeCents: 1_000, feeMode: "PRODUCER" },
      200,
    );
    await service.postForPaidOrder(ORG, ORDER, { correlationId: "c" });
    const count = ledger.entries.length;
    await service.postForPaidOrder(ORG, ORDER, { correlationId: "c" });
    expect(ledger.entries.length).toBe(count);
  });

  it("does not post for a non-paid order", async () => {
    const { ledger, service } = build({
      subtotalCents: 10_000,
      discountCents: 0,
      feeCents: 0,
      feeMode: "PRODUCER",
      status: "AWAITING_PAYMENT",
    });
    await service.postForPaidOrder(ORG, ORDER, { correlationId: "c" });
    expect(ledger.entries).toHaveLength(0);
  });
});

describe("reverseForOrder (FR-FIN-007)", () => {
  it("nets every account to zero and is idempotent", async () => {
    const { ledger, service } = build(
      { subtotalCents: 20_000, discountCents: 0, feeCents: 2_000, feeMode: "PRODUCER" },
      500,
    );
    await service.postForPaidOrder(ORG, ORDER, { correlationId: "c" });

    await service.reverseForOrder(ORG, ORDER, { correlationId: "c" });
    await service.reverseForOrder(ORG, ORDER, { correlationId: "c" }); // idempotent

    const b = balances(ledger);
    expect(b.PRODUCER).toBe(0);
    expect(b.PLATFORM).toBe(0);
    expect(b.PROMOTER).toBe(0);
    const refunds = ledger.entries.filter((e) => e.type === "REFUND");
    // one per non-zero account (producer, platform, promoter)
    expect(refunds).toHaveLength(3);
  });
});

describe("financial summary & payout (FR-FIN-003/013/010)", () => {
  const financeCtx: RequestContext = {
    organizationId: ORG,
    userId: "u_fin",
    role: "member",
    correlationId: "c",
  };

  it("summary is reproducible from the ledger; payout reduces producer payable", async () => {
    const { ledger, memberships, service } = build(
      { subtotalCents: 20_000, discountCents: 4_000, feeCents: 1_600, feeMode: "PRODUCER" },
      500,
    );
    await memberships.create({ organizationId: ORG, userId: "u_fin", role: "FINANCE" });
    await service.postForPaidOrder(ORG, ORDER, { correlationId: "c" });

    const summary = await service.getEventFinancialSummary(financeCtx, EVENT);
    expect(summary.grossSalesCents).toBe(20_000);
    expect(summary.discountCents).toBe(4_000);
    expect(summary.platformFeeCents).toBe(1_600);
    expect(summary.commissionCents).toBe(500);
    // producer = 20000 − 4000 − 1600 − 500 = 13900
    expect(summary.producerPayableCents).toBe(13_900);

    await service.registerExternalPayout(financeCtx, EVENT, {
      amountCents: 13_900,
      memo: "PIX ref 123",
    });
    const after = await service.getEventFinancialSummary(financeCtx, EVENT);
    expect(after.producerPayableCents).toBe(0);
    expect(after.payoutsCents).toBe(13_900);
    expect(ledger.entries.some((e) => e.type === "PAYOUT")).toBe(true);
  });

  it("denies a non-finance caller", async () => {
    const { memberships, service } = build({
      subtotalCents: 10_000,
      discountCents: 0,
      feeCents: 0,
      feeMode: "PRODUCER",
    });
    await memberships.create({ organizationId: ORG, userId: "u_promo", role: "PROMOTER" });
    const promoterCtx: RequestContext = {
      organizationId: ORG,
      userId: "u_promo",
      role: "member",
      correlationId: "c",
    };
    await expect(
      service.getEventFinancialSummary(promoterCtx, EVENT),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });
});
