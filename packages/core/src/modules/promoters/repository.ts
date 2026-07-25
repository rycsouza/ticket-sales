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
  PromoterRecord,
} from "./types";

// Every method touching org-owned data REQUIRES organizationId in scope
// (AGENTS.md / CLAUDE_SECURITY_RULES §7). Code/token lookups are the only
// cross-scope reads (the code/token is the capability) and the caller re-checks
// event ownership afterwards.

export interface PromoterRepository {
  create(data: {
    organizationId: string;
    name: string;
    contactEmail?: string | undefined;
    contactPhone?: string | undefined;
    reportTokenHash: string;
  }): Promise<PromoterRecord>;
  findById(organizationId: string, id: string): Promise<PromoterRecord | null>;
  findByMembership(organizationId: string, membershipId: string): Promise<PromoterRecord | null>;
  /** Cross-scope read by report token hash (the token is the capability). */
  findByReportTokenHash(reportTokenHash: string): Promise<PromoterRecord | null>;
  listByOrganization(organizationId: string): Promise<PromoterRecord[]>;
  attachMembership(organizationId: string, id: string, membershipId: string): Promise<void>;
  updateReportTokenHash(organizationId: string, id: string, reportTokenHash: string): Promise<void>;
  setActive(organizationId: string, id: string, active: boolean): Promise<void>;
}

export interface PromoterAssignmentRepository {
  create(data: {
    organizationId: string;
    eventId: string;
    promoterId: string;
  }): Promise<PromoterAssignmentRecord>;
  findByEventAndPromoter(
    organizationId: string,
    eventId: string,
    promoterId: string,
  ): Promise<PromoterAssignmentRecord | null>;
  listByEvent(organizationId: string, eventId: string): Promise<PromoterAssignmentRecord[]>;
  listByPromoter(organizationId: string, promoterId: string): Promise<PromoterAssignmentRecord[]>;
}

export interface PromoterLinkRepository {
  create(data: {
    organizationId: string;
    eventId: string;
    promoterId: string;
    code: string;
  }): Promise<PromoterLinkRecord>;
  findByCode(code: string): Promise<PromoterLinkRecord | null>;
  findByEventAndPromoter(
    organizationId: string,
    eventId: string,
    promoterId: string,
  ): Promise<PromoterLinkRecord | null>;
  listByEvent(organizationId: string, eventId: string): Promise<PromoterLinkRecord[]>;
  sumClicksByPromoter(organizationId: string, promoterId: string): Promise<number>;
  incrementClick(id: string): Promise<void>;
}

export interface CouponRepository {
  create(data: {
    organizationId: string;
    /** null/undefined = organization-wide default coupon. */
    eventId?: string | null | undefined;
    code: string;
    type: CouponType;
    value: number;
    promoterId?: string | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | undefined;
    maxRedemptions?: number | undefined;
  }): Promise<CouponRecord>;
  /**
   * Resolves a coupon code for an event with hierarchy event > org-default:
   * an event-scoped coupon shadows the org default of the same code.
   */
  resolveByCode(
    organizationId: string,
    eventId: string,
    code: string,
  ): Promise<CouponRecord | null>;
  /** Exact event-scoped lookup (null eventId = org default). */
  findByCode(
    organizationId: string,
    eventId: string | null,
    code: string,
  ): Promise<CouponRecord | null>;
  listByEvent(organizationId: string, eventId: string): Promise<CouponRecord[]>;
  listByOrganization(organizationId: string): Promise<CouponRecord[]>;
  /**
   * Atomic conditional increment: succeeds only while under the redemption
   * cap. Returns false when exhausted (never oversells a limited coupon).
   */
  tryIncrementRedemption(organizationId: string, couponId: string): Promise<boolean>;
}

export interface CommissionRuleRepository {
  /**
   * Creates a rule and supersedes the previous ACTIVE rule with the exact same
   * scope (event + promoter + ticketType), so history is preserved but only one
   * rule per scope is active (BR-PRM-006, FR-PRM-015). eventId null = org default.
   */
  createSuperseding(data: {
    organizationId: string;
    eventId?: string | null | undefined;
    promoterId?: string | undefined;
    ticketTypeId?: string | undefined;
    type: CommissionType;
    value: number;
    base: CommissionBase;
  }): Promise<CommissionRuleRecord>;
  /** Active rules for an event AND org-defaults (eventId null). */
  listActiveByEvent(organizationId: string, eventId: string): Promise<CommissionRuleRecord[]>;
  listByEvent(organizationId: string, eventId: string): Promise<CommissionRuleRecord[]>;
  listByOrganization(organizationId: string): Promise<CommissionRuleRecord[]>;
}

export interface OrderAttributionRepository {
  /** Idempotent on orderId (unique) — a retry never duplicates attribution. */
  upsert(data: {
    organizationId: string;
    orderId: string;
    eventId: string;
    mechanism: OrderAttributionRecord["mechanism"];
    promoterId?: string | undefined;
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
  countByPromoter(organizationId: string, promoterId: string): Promise<number>;
}

export interface PromoterSummaryRow {
  promoterId: string;
  quantity: number;
  baseCents: number;
  amountCents: number;
}

export interface PromoterEventSummaryRow extends PromoterSummaryRow {
  eventId: string;
}

export interface CommissionEntryRepository {
  /** Idempotent per (orderId, type): returns false when the row already exists. */
  create(data: {
    organizationId: string;
    eventId: string;
    promoterId: string;
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
  summaryForPromoter(organizationId: string, promoterId: string): Promise<PromoterSummaryRow>;
  /** Net totals for one promoter, grouped by event (report breakdown). */
  summaryForPromoterByEvent(
    organizationId: string,
    promoterId: string,
  ): Promise<PromoterEventSummaryRow[]>;
}

// ---------------------------------------------------------------------------
// Prisma implementations
// ---------------------------------------------------------------------------

const promoterSelect = {
  id: true,
  organizationId: true,
  name: true,
  contactEmail: true,
  contactPhone: true,
  membershipId: true,
  active: true,
} as const;

const assignmentSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  promoterId: true,
  active: true,
} as const;

const linkSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  promoterId: true,
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
  promoterId: true,
  startsAt: true,
  endsAt: true,
  maxRedemptions: true,
  redemptions: true,
} as const;

const ruleSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  promoterId: true,
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
  promoterId: true,
  couponId: true,
  linkId: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  utmContent: true,
  utmTerm: true,
} as const;

export class PrismaPromoterRepository implements PromoterRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    name: string;
    contactEmail?: string | undefined;
    contactPhone?: string | undefined;
    reportTokenHash: string;
  }) {
    return this.prisma.promoter.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
        reportTokenHash: data.reportTokenHash,
      },
      select: promoterSelect,
    });
  }

  async findById(organizationId: string, id: string) {
    return this.prisma.promoter.findFirst({
      where: { id, organizationId },
      select: promoterSelect,
    });
  }

  async findByMembership(organizationId: string, membershipId: string) {
    return this.prisma.promoter.findFirst({
      where: { organizationId, membershipId },
      select: promoterSelect,
    });
  }

  async findByReportTokenHash(reportTokenHash: string) {
    return this.prisma.promoter.findUnique({
      where: { reportTokenHash },
      select: promoterSelect,
    });
  }

  async listByOrganization(organizationId: string) {
    return this.prisma.promoter.findMany({
      where: { organizationId },
      select: promoterSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async attachMembership(organizationId: string, id: string, membershipId: string) {
    const result = await this.prisma.promoter.updateMany({
      where: { id, organizationId },
      data: { membershipId },
    });
    if (result.count === 0) throw new Error("Promoter not found in organization scope");
  }

  async updateReportTokenHash(organizationId: string, id: string, reportTokenHash: string) {
    const result = await this.prisma.promoter.updateMany({
      where: { id, organizationId },
      data: { reportTokenHash },
    });
    if (result.count === 0) throw new Error("Promoter not found in organization scope");
  }

  async setActive(organizationId: string, id: string, active: boolean) {
    const result = await this.prisma.promoter.updateMany({
      where: { id, organizationId },
      data: { active },
    });
    if (result.count === 0) throw new Error("Promoter not found in organization scope");
  }
}

export class PrismaPromoterAssignmentRepository implements PromoterAssignmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: { organizationId: string; eventId: string; promoterId: string }) {
    return this.prisma.promoterAssignment.upsert({
      where: { eventId_promoterId: { eventId: data.eventId, promoterId: data.promoterId } },
      create: data,
      update: { active: true },
      select: assignmentSelect,
    });
  }

  async findByEventAndPromoter(organizationId: string, eventId: string, promoterId: string) {
    return this.prisma.promoterAssignment.findFirst({
      where: { organizationId, eventId, promoterId },
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

  async listByPromoter(organizationId: string, promoterId: string) {
    return this.prisma.promoterAssignment.findMany({
      where: { organizationId, promoterId },
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
    promoterId: string;
    code: string;
  }) {
    return this.prisma.promoterLink.create({ data, select: linkSelect });
  }

  async findByCode(code: string) {
    return this.prisma.promoterLink.findUnique({ where: { code }, select: linkSelect });
  }

  async findByEventAndPromoter(organizationId: string, eventId: string, promoterId: string) {
    return this.prisma.promoterLink.findFirst({
      where: { organizationId, eventId, promoterId },
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

  async sumClicksByPromoter(organizationId: string, promoterId: string) {
    const agg = await this.prisma.promoterLink.aggregate({
      where: { organizationId, promoterId },
      _sum: { clickCount: true },
    });
    return agg._sum.clickCount ?? 0;
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
    eventId?: string | null | undefined;
    code: string;
    type: CouponType;
    value: number;
    promoterId?: string | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | undefined;
    maxRedemptions?: number | undefined;
  }) {
    return this.prisma.coupon.create({
      data: {
        organizationId: data.organizationId,
        eventId: data.eventId ?? null,
        code: data.code,
        type: data.type,
        value: data.value,
        promoterId: data.promoterId ?? null,
        startsAt: data.startsAt ?? null,
        endsAt: data.endsAt ?? null,
        maxRedemptions: data.maxRedemptions ?? null,
      },
      select: couponSelect,
    });
  }

  async resolveByCode(organizationId: string, eventId: string, code: string) {
    const scoped = await this.prisma.coupon.findFirst({
      where: { organizationId, eventId, code },
      select: couponSelect,
    });
    if (scoped) return scoped;
    return this.prisma.coupon.findFirst({
      where: { organizationId, eventId: null, code },
      select: couponSelect,
    });
  }

  async findByCode(organizationId: string, eventId: string | null, code: string) {
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

  async listByOrganization(organizationId: string) {
    return this.prisma.coupon.findMany({
      where: { organizationId },
      select: couponSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async tryIncrementRedemption(organizationId: string, couponId: string): Promise<boolean> {
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
    eventId?: string | null | undefined;
    promoterId?: string | undefined;
    ticketTypeId?: string | undefined;
    type: CommissionType;
    value: number;
    base: CommissionBase;
  }) {
    const eventId = data.eventId ?? null;
    return this.prisma.$transaction(async (tx) => {
      await tx.commissionRule.updateMany({
        where: {
          organizationId: data.organizationId,
          eventId,
          promoterId: data.promoterId ?? null,
          ticketTypeId: data.ticketTypeId ?? null,
          active: true,
        },
        data: { active: false, supersededAt: new Date() },
      });
      return tx.commissionRule.create({
        data: {
          organizationId: data.organizationId,
          eventId,
          promoterId: data.promoterId ?? null,
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
      where: { organizationId, active: true, OR: [{ eventId }, { eventId: null }] },
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

  async listByOrganization(organizationId: string) {
    return this.prisma.commissionRule.findMany({
      where: { organizationId },
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
    promoterId?: string | undefined;
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
      promoterId: data.promoterId ?? null,
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

  async countByPromoter(organizationId: string, promoterId: string) {
    return this.prisma.orderAttribution.count({ where: { organizationId, promoterId } });
  }
}

export class PrismaCommissionEntryRepository implements CommissionEntryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId: string;
    eventId: string;
    promoterId: string;
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
          promoterId: data.promoterId,
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
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  async findByOrderAndType(organizationId: string, orderId: string, type: CommissionEntryType) {
    return this.prisma.commissionEntry.findFirst({
      where: { organizationId, orderId, type },
      select: {
        id: true,
        organizationId: true,
        eventId: true,
        promoterId: true,
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
      by: ["promoterId"],
      where: { organizationId, eventId },
      _sum: { quantity: true, baseCents: true, amountCents: true },
    });
    return grouped.map((row) => ({
      promoterId: row.promoterId,
      quantity: row._sum.quantity ?? 0,
      baseCents: row._sum.baseCents ?? 0,
      amountCents: row._sum.amountCents ?? 0,
    }));
  }

  async summaryForPromoter(
    organizationId: string,
    promoterId: string,
  ): Promise<PromoterSummaryRow> {
    const agg = await this.prisma.commissionEntry.aggregate({
      where: { organizationId, promoterId },
      _sum: { quantity: true, baseCents: true, amountCents: true },
    });
    return {
      promoterId,
      quantity: agg._sum.quantity ?? 0,
      baseCents: agg._sum.baseCents ?? 0,
      amountCents: agg._sum.amountCents ?? 0,
    };
  }

  async summaryForPromoterByEvent(
    organizationId: string,
    promoterId: string,
  ): Promise<PromoterEventSummaryRow[]> {
    const grouped = await this.prisma.commissionEntry.groupBy({
      by: ["eventId"],
      where: { organizationId, promoterId },
      _sum: { quantity: true, baseCents: true, amountCents: true },
    });
    return grouped.map((row) => ({
      eventId: row.eventId,
      promoterId,
      quantity: row._sum.quantity ?? 0,
      baseCents: row._sum.baseCents ?? 0,
      amountCents: row._sum.amountCents ?? 0,
    }));
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
