import type { PrismaClient } from "@ingressos/db";
import type {
  CommissionBase,
  CommissionEntryRecord,
  CommissionEntryType,
  CommissionRuleRecord,
  CommissionType,
  CouponRecord,
  CouponType,
  OrderAttributionRecord,
  PromoterAssignmentRecord,
  PromoterLinkRecord,
} from "./types";

// Every method touching org-owned data REQUIRES organizationId in scope
// (AGENTS.md / CLAUDE_SECURITY_RULES §7). Code/token lookups are the only
// cross-scope reads (the code is the capability) and the caller re-checks
// event ownership afterwards.

export interface PromoterAssignmentRepository {
  create(data: {
    organizationId: string;
    eventId: string;
    membershipId: string;
  }): Promise<PromoterAssignmentRecord>;
  findByEventAndMembership(
    organizationId: string,
    eventId: string,
    membershipId: string,
  ): Promise<PromoterAssignmentRecord | null>;
  listByEvent(organizationId: string, eventId: string): Promise<PromoterAssignmentRecord[]>;
}

export interface PromoterLinkRepository {
  create(data: {
    organizationId: string;
    eventId: string;
    membershipId: string;
    code: string;
  }): Promise<PromoterLinkRecord>;
  findByCode(code: string): Promise<PromoterLinkRecord | null>;
  findByEventAndMembership(
    organizationId: string,
    eventId: string,
    membershipId: string,
  ): Promise<PromoterLinkRecord | null>;
  listByEvent(organizationId: string, eventId: string): Promise<PromoterLinkRecord[]>;
  incrementClick(id: string): Promise<void>;
}

export interface CouponRepository {
  create(data: {
    organizationId: string;
    eventId: string;
    code: string;
    type: CouponType;
    value: number;
    membershipId?: string | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | undefined;
    maxRedemptions?: number | undefined;
  }): Promise<CouponRecord>;
  findByEventAndCode(
    organizationId: string,
    eventId: string,
    code: string,
  ): Promise<CouponRecord | null>;
  listByEvent(organizationId: string, eventId: string): Promise<CouponRecord[]>;
  /**
   * Atomic conditional increment: succeeds only while under the redemption
   * cap. Returns false when exhausted (never oversells a limited coupon).
   */
  tryIncrementRedemption(organizationId: string, couponId: string): Promise<boolean>;
}

export interface CommissionRuleRepository {
  /**
   * Creates a rule and supersedes the previous ACTIVE rule with the exact same
   * scope (event + membership + ticketType), so history is preserved but only
   * one rule per scope is active (BR-PRM-006, FR-PRM-015).
   */
  createSuperseding(data: {
    organizationId: string;
    eventId: string;
    membershipId?: string | undefined;
    ticketTypeId?: string | undefined;
    type: CommissionType;
    value: number;
    base: CommissionBase;
  }): Promise<CommissionRuleRecord>;
  listActiveByEvent(organizationId: string, eventId: string): Promise<CommissionRuleRecord[]>;
  listByEvent(organizationId: string, eventId: string): Promise<CommissionRuleRecord[]>;
}

export interface OrderAttributionRepository {
  /** Idempotent on orderId (unique) — a retry never duplicates attribution. */
  upsert(data: {
    organizationId: string;
    orderId: string;
    eventId: string;
    mechanism: OrderAttributionRecord["mechanism"];
    membershipId?: string | undefined;
    couponId?: string | undefined;
    linkId?: string | undefined;
    utmSource?: string | undefined;
    utmMedium?: string | undefined;
    utmCampaign?: string | undefined;
    utmContent?: string | undefined;
    utmTerm?: string | undefined;
  }): Promise<void>;
  findByOrder(
    organizationId: string,
    orderId: string,
  ): Promise<OrderAttributionRecord | null>;
}

export interface PromoterSummaryRow {
  membershipId: string;
  quantity: number;
  baseCents: number;
  amountCents: number;
}

export interface CommissionEntryRepository {
  /** Idempotent per (orderId, type): returns false when the row already exists. */
  create(data: {
    organizationId: string;
    eventId: string;
    membershipId: string;
    orderId: string;
    type: CommissionEntryType;
    quantity: number;
    baseCents: number;
    amountCents: number;
    ruleSnapshot: unknown;
    correlationId: string;
  }): Promise<boolean>;
  findByOrderAndType(
    organizationId: string,
    orderId: string,
    type: CommissionEntryType,
  ): Promise<CommissionEntryRecord | null>;
  /** Net totals grouped by promoter (accruals + reversals) — FR-PRM-013. */
  summaryByEvent(organizationId: string, eventId: string): Promise<PromoterSummaryRow[]>;
  /** Net totals for one promoter across the org (FR-PRM-012). */
  summaryForPromoter(
    organizationId: string,
    membershipId: string,
  ): Promise<PromoterSummaryRow>;
}

// ---------------------------------------------------------------------------
// Prisma implementations
// ---------------------------------------------------------------------------

const assignmentSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  membershipId: true,
  active: true,
} as const;

const linkSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  membershipId: true,
  code: true,
  active: true,
  clickCount: true,
} as const;

const couponSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  code: true,
  type: true,
  value: true,
  active: true,
  membershipId: true,
  startsAt: true,
  endsAt: true,
  maxRedemptions: true,
  redemptions: true,
} as const;

const ruleSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  membershipId: true,
  ticketTypeId: true,
  type: true,
  value: true,
  base: true,
  active: true,
} as const;

const attributionSelect = {
  id: true,
  organizationId: true,
  orderId: true,
  eventId: true,
  mechanism: true,
  membershipId: true,
  couponId: true,
  linkId: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  utmContent: true,
  utmTerm: true,
} as const;

export class PrismaPromoterAssignmentRepository implements PromoterAssignmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: { organizationId: string; eventId: string; membershipId: string }) {
    return this.prisma.promoterAssignment.upsert({
      where: { eventId_membershipId: { eventId: data.eventId, membershipId: data.membershipId } },
      create: data,
      update: { active: true },
      select: assignmentSelect,
    });
  }

  async findByEventAndMembership(
    organizationId: string,
    eventId: string,
    membershipId: string,
  ) {
    return this.prisma.promoterAssignment.findFirst({
      where: { organizationId, eventId, membershipId },
      select: assignmentSelect,
    });
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.prisma.promoterAssignment.findMany({
      where: { organizationId, eventId },
      select: assignmentSelect,
      orderBy: { createdAt: "asc" },
    });
  }
}

export class PrismaPromoterLinkRepository implements PromoterLinkRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    eventId: string;
    membershipId: string;
    code: string;
  }) {
    return this.prisma.promoterLink.create({ data, select: linkSelect });
  }

  async findByCode(code: string) {
    return this.prisma.promoterLink.findUnique({ where: { code }, select: linkSelect });
  }

  async findByEventAndMembership(
    organizationId: string,
    eventId: string,
    membershipId: string,
  ) {
    return this.prisma.promoterLink.findFirst({
      where: { organizationId, eventId, membershipId },
      select: linkSelect,
    });
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.prisma.promoterLink.findMany({
      where: { organizationId, eventId },
      select: linkSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async incrementClick(id: string) {
    await this.prisma.promoterLink.update({
      where: { id },
      data: { clickCount: { increment: 1 } },
    });
  }
}

export class PrismaCouponRepository implements CouponRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    eventId: string;
    code: string;
    type: CouponType;
    value: number;
    membershipId?: string | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | undefined;
    maxRedemptions?: number | undefined;
  }) {
    return this.prisma.coupon.create({
      data: {
        organizationId: data.organizationId,
        eventId: data.eventId,
        code: data.code,
        type: data.type,
        value: data.value,
        membershipId: data.membershipId ?? null,
        startsAt: data.startsAt ?? null,
        endsAt: data.endsAt ?? null,
        maxRedemptions: data.maxRedemptions ?? null,
      },
      select: couponSelect,
    });
  }

  async findByEventAndCode(organizationId: string, eventId: string, code: string) {
    return this.prisma.coupon.findFirst({
      where: { organizationId, eventId, code },
      select: couponSelect,
    });
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.prisma.coupon.findMany({
      where: { organizationId, eventId },
      select: couponSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async tryIncrementRedemption(organizationId: string, couponId: string): Promise<boolean> {
    // Unlimited coupons (maxRedemptions null) always succeed; limited ones use
    // a conditional update so concurrent redemptions never exceed the cap.
    const unlimited = await this.prisma.coupon.updateMany({
      where: { id: couponId, organizationId, maxRedemptions: null },
      data: { redemptions: { increment: 1 } },
    });
    if (unlimited.count > 0) return true;

    const limited = await this.prisma.$executeRaw`
      UPDATE "Coupon"
      SET "redemptions" = "redemptions" + 1
      WHERE "id" = ${couponId}
        AND "organizationId" = ${organizationId}
        AND "maxRedemptions" IS NOT NULL
        AND "redemptions" < "maxRedemptions"
    `;
    return limited > 0;
  }
}

export class PrismaCommissionRuleRepository implements CommissionRuleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createSuperseding(data: {
    organizationId: string;
    eventId: string;
    membershipId?: string | undefined;
    ticketTypeId?: string | undefined;
    type: CommissionType;
    value: number;
    base: CommissionBase;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.commissionRule.updateMany({
        where: {
          organizationId: data.organizationId,
          eventId: data.eventId,
          membershipId: data.membershipId ?? null,
          ticketTypeId: data.ticketTypeId ?? null,
          active: true,
        },
        data: { active: false, supersededAt: new Date() },
      });
      return tx.commissionRule.create({
        data: {
          organizationId: data.organizationId,
          eventId: data.eventId,
          membershipId: data.membershipId ?? null,
          ticketTypeId: data.ticketTypeId ?? null,
          type: data.type,
          value: data.value,
          base: data.base,
        },
        select: ruleSelect,
      });
    });
  }

  async listActiveByEvent(organizationId: string, eventId: string) {
    return this.prisma.commissionRule.findMany({
      where: { organizationId, eventId, active: true },
      select: ruleSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.prisma.commissionRule.findMany({
      where: { organizationId, eventId },
      select: ruleSelect,
      orderBy: { createdAt: "desc" },
    });
  }
}

export class PrismaOrderAttributionRepository implements OrderAttributionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(data: {
    organizationId: string;
    orderId: string;
    eventId: string;
    mechanism: OrderAttributionRecord["mechanism"];
    membershipId?: string | undefined;
    couponId?: string | undefined;
    linkId?: string | undefined;
    utmSource?: string | undefined;
    utmMedium?: string | undefined;
    utmCampaign?: string | undefined;
    utmContent?: string | undefined;
    utmTerm?: string | undefined;
  }) {
    const payload = {
      organizationId: data.organizationId,
      eventId: data.eventId,
      mechanism: data.mechanism,
      membershipId: data.membershipId ?? null,
      couponId: data.couponId ?? null,
      linkId: data.linkId ?? null,
      utmSource: data.utmSource ?? null,
      utmMedium: data.utmMedium ?? null,
      utmCampaign: data.utmCampaign ?? null,
      utmContent: data.utmContent ?? null,
      utmTerm: data.utmTerm ?? null,
    };
    await this.prisma.orderAttribution.upsert({
      where: { orderId: data.orderId },
      create: { orderId: data.orderId, ...payload },
      update: payload,
    });
  }

  async findByOrder(organizationId: string, orderId: string) {
    return this.prisma.orderAttribution.findFirst({
      where: { organizationId, orderId },
      select: attributionSelect,
    });
  }
}

export class PrismaCommissionEntryRepository implements CommissionEntryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    eventId: string;
    membershipId: string;
    orderId: string;
    type: CommissionEntryType;
    quantity: number;
    baseCents: number;
    amountCents: number;
    ruleSnapshot: unknown;
    correlationId: string;
  }): Promise<boolean> {
    try {
      await this.prisma.commissionEntry.create({
        data: {
          organizationId: data.organizationId,
          eventId: data.eventId,
          membershipId: data.membershipId,
          orderId: data.orderId,
          type: data.type,
          quantity: data.quantity,
          baseCents: data.baseCents,
          amountCents: data.amountCents,
          ruleSnapshot: data.ruleSnapshot as never,
          correlationId: data.correlationId,
        },
      });
      return true;
    } catch (error) {
      // Unique(orderId, type) violation → already posted, idempotent no-op.
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  async findByOrderAndType(
    organizationId: string,
    orderId: string,
    type: CommissionEntryType,
  ) {
    return this.prisma.commissionEntry.findFirst({
      where: { organizationId, orderId, type },
      select: {
        id: true,
        organizationId: true,
        eventId: true,
        membershipId: true,
        orderId: true,
        type: true,
        quantity: true,
        baseCents: true,
        amountCents: true,
      },
    });
  }

  async summaryByEvent(organizationId: string, eventId: string): Promise<PromoterSummaryRow[]> {
    const grouped = await this.prisma.commissionEntry.groupBy({
      by: ["membershipId"],
      where: { organizationId, eventId },
      _sum: { quantity: true, baseCents: true, amountCents: true },
    });
    return grouped.map((row) => ({
      membershipId: row.membershipId,
      quantity: row._sum.quantity ?? 0,
      baseCents: row._sum.baseCents ?? 0,
      amountCents: row._sum.amountCents ?? 0,
    }));
  }

  async summaryForPromoter(
    organizationId: string,
    membershipId: string,
  ): Promise<PromoterSummaryRow> {
    const agg = await this.prisma.commissionEntry.aggregate({
      where: { organizationId, membershipId },
      _sum: { quantity: true, baseCents: true, amountCents: true },
    });
    return {
      membershipId,
      quantity: agg._sum.quantity ?? 0,
      baseCents: agg._sum.baseCents ?? 0,
      amountCents: agg._sum.amountCents ?? 0,
    };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
