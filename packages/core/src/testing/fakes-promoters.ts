// In-memory fakes for the promoters module. They reproduce the invariants that
// matter for correctness: coupon redemption cap, one active rule per scope,
// hierarchical resolution, and append-only commission entries idempotent per
// (orderId, type).

import type {
  CommissionEntryRepository,
  CommissionRuleRepository,
  CouponRepository,
  OrderAttributionRepository,
  PromoterAssignmentRepository,
  PromoterEventSummaryRow,
  PromoterLinkRepository,
  PromoterRepository,
  PromoterSummaryRow,
} from "../modules/promoters/repository";
import type {
  CommissionEntryRecord,
  CommissionEntryType,
  CommissionRuleRecord,
  CouponRecord,
  OrderAttributionRecord,
  PromoterAssignmentRecord,
  PromoterLinkRecord,
  PromoterRecord,
} from "../modules/promoters/types";
import { nextId } from "./fakes";

export class InMemoryPromoterRepository implements PromoterRepository {
  readonly promoters: (PromoterRecord & { reportTokenHash: string })[] = [];

  async create(data: {
    organizationId: string;
    name: string;
    contactEmail?: string | undefined;
    contactPhone?: string | undefined;
    reportTokenHash: string;
  }) {
    const record: PromoterRecord & { reportTokenHash: string } = {
      id: nextId("prm"),
      organizationId: data.organizationId,
      name: data.name,
      contactEmail: data.contactEmail ?? null,
      contactPhone: data.contactPhone ?? null,
      membershipId: null,
      active: true,
      reportTokenHash: data.reportTokenHash,
    };
    this.promoters.push(record);
    return this.strip(record);
  }

  async findById(organizationId: string, id: string) {
    const p = this.promoters.find((x) => x.id === id && x.organizationId === organizationId);
    return p ? this.strip(p) : null;
  }

  async findByMembership(organizationId: string, membershipId: string) {
    const p = this.promoters.find(
      (x) => x.organizationId === organizationId && x.membershipId === membershipId,
    );
    return p ? this.strip(p) : null;
  }

  async findByReportTokenHash(reportTokenHash: string) {
    const p = this.promoters.find((x) => x.reportTokenHash === reportTokenHash);
    return p ? this.strip(p) : null;
  }

  async listByOrganization(organizationId: string) {
    return this.promoters
      .filter((x) => x.organizationId === organizationId)
      .map((x) => this.strip(x));
  }

  async attachMembership(organizationId: string, id: string, membershipId: string) {
    const p = this.promoters.find((x) => x.id === id && x.organizationId === organizationId);
    if (!p) throw new Error("Promoter not found in organization scope");
    p.membershipId = membershipId;
  }

  async updateReportTokenHash(organizationId: string, id: string, reportTokenHash: string) {
    const p = this.promoters.find((x) => x.id === id && x.organizationId === organizationId);
    if (!p) throw new Error("Promoter not found in organization scope");
    p.reportTokenHash = reportTokenHash;
  }

  async setActive(organizationId: string, id: string, active: boolean) {
    const p = this.promoters.find((x) => x.id === id && x.organizationId === organizationId);
    if (!p) throw new Error("Promoter not found in organization scope");
    p.active = active;
  }

  private strip(p: PromoterRecord & { reportTokenHash: string }): PromoterRecord {
    const { reportTokenHash: _omit, ...rest } = p;
    void _omit;
    return { ...rest };
  }
}

export class InMemoryPromoterAssignmentRepository implements PromoterAssignmentRepository {
  readonly assignments: PromoterAssignmentRecord[] = [];

  async create(data: { organizationId: string; eventId: string; promoterId: string }) {
    const existing = this.assignments.find(
      (a) => a.eventId === data.eventId && a.promoterId === data.promoterId,
    );
    if (existing) {
      existing.active = true;
      return existing;
    }
    const record: PromoterAssignmentRecord = {
      id: nextId("pas"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      promoterId: data.promoterId,
      active: true,
    };
    this.assignments.push(record);
    return record;
  }

  async findByEventAndPromoter(organizationId: string, eventId: string, promoterId: string) {
    return (
      this.assignments.find(
        (a) =>
          a.organizationId === organizationId &&
          a.eventId === eventId &&
          a.promoterId === promoterId,
      ) ?? null
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.assignments.filter(
      (a) => a.organizationId === organizationId && a.eventId === eventId,
    );
  }

  async listByPromoter(organizationId: string, promoterId: string) {
    return this.assignments.filter(
      (a) => a.organizationId === organizationId && a.promoterId === promoterId,
    );
  }
}

export class InMemoryPromoterLinkRepository implements PromoterLinkRepository {
  readonly links: PromoterLinkRecord[] = [];

  async create(data: {
    organizationId: string;
    eventId: string;
    promoterId: string;
    code: string;
  }) {
    const record: PromoterLinkRecord = {
      id: nextId("plk"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      promoterId: data.promoterId,
      code: data.code,
      active: true,
      clickCount: 0,
    };
    this.links.push(record);
    return record;
  }

  async findByCode(code: string) {
    return this.links.find((l) => l.code === code) ?? null;
  }

  async findByEventAndPromoter(organizationId: string, eventId: string, promoterId: string) {
    return (
      this.links.find(
        (l) =>
          l.organizationId === organizationId &&
          l.eventId === eventId &&
          l.promoterId === promoterId,
      ) ?? null
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.links.filter(
      (l) => l.organizationId === organizationId && l.eventId === eventId,
    );
  }

  async sumClicksByPromoter(organizationId: string, promoterId: string) {
    return this.links
      .filter((l) => l.organizationId === organizationId && l.promoterId === promoterId)
      .reduce((sum, l) => sum + l.clickCount, 0);
  }

  async incrementClick(id: string) {
    const link = this.links.find((l) => l.id === id);
    if (link) link.clickCount += 1;
  }
}

export class InMemoryCouponRepository implements CouponRepository {
  readonly coupons: CouponRecord[] = [];

  async create(data: {
    organizationId: string;
    eventId?: string | null | undefined;
    code: string;
    type: CouponRecord["type"];
    value: number;
    promoterId?: string | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | undefined;
    maxRedemptions?: number | undefined;
  }) {
    const record: CouponRecord = {
      id: nextId("cpn"),
      organizationId: data.organizationId,
      eventId: data.eventId ?? null,
      code: data.code,
      type: data.type,
      value: data.value,
      active: true,
      promoterId: data.promoterId ?? null,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      maxRedemptions: data.maxRedemptions ?? null,
      redemptions: 0,
    };
    this.coupons.push(record);
    return record;
  }

  async resolveByCode(organizationId: string, eventId: string, code: string) {
    const scoped = this.coupons.find(
      (c) => c.organizationId === organizationId && c.eventId === eventId && c.code === code,
    );
    if (scoped) return scoped;
    return (
      this.coupons.find(
        (c) => c.organizationId === organizationId && c.eventId === null && c.code === code,
      ) ?? null
    );
  }

  async findByCode(organizationId: string, eventId: string | null, code: string) {
    return (
      this.coupons.find(
        (c) => c.organizationId === organizationId && c.eventId === eventId && c.code === code,
      ) ?? null
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.coupons.filter(
      (c) => c.organizationId === organizationId && c.eventId === eventId,
    );
  }

  async listByOrganization(organizationId: string) {
    return this.coupons.filter((c) => c.organizationId === organizationId);
  }

  async hasActiveForEvent(organizationId: string, eventId: string, now: Date): Promise<boolean> {
    return this.coupons.some(
      (c) =>
        c.organizationId === organizationId &&
        c.active &&
        (c.eventId === eventId || c.eventId === null) &&
        (!c.startsAt || c.startsAt <= now) &&
        (!c.endsAt || c.endsAt >= now),
    );
  }

  async tryIncrementRedemption(organizationId: string, couponId: string): Promise<boolean> {
    const coupon = this.coupons.find(
      (c) => c.id === couponId && c.organizationId === organizationId,
    );
    if (!coupon) return false;
    if (coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions) {
      return false;
    }
    coupon.redemptions += 1;
    return true;
  }
}

export class InMemoryCommissionRuleRepository implements CommissionRuleRepository {
  readonly rules: (CommissionRuleRecord & { createdAt: number })[] = [];
  private seq = 0;

  async createSuperseding(data: {
    organizationId: string;
    eventId?: string | null | undefined;
    promoterId?: string | undefined;
    ticketTypeId?: string | undefined;
    type: CommissionRuleRecord["type"];
    value: number;
    base: CommissionRuleRecord["base"];
  }) {
    const eventId = data.eventId ?? null;
    const promoterId = data.promoterId ?? null;
    const ticketTypeId = data.ticketTypeId ?? null;
    for (const rule of this.rules) {
      if (
        rule.organizationId === data.organizationId &&
        rule.eventId === eventId &&
        rule.promoterId === promoterId &&
        rule.ticketTypeId === ticketTypeId &&
        rule.active
      ) {
        rule.active = false;
      }
    }
    const record: CommissionRuleRecord & { createdAt: number } = {
      id: nextId("crl"),
      organizationId: data.organizationId,
      eventId,
      promoterId,
      ticketTypeId,
      type: data.type,
      value: data.value,
      base: data.base,
      active: true,
      createdAt: this.seq++,
    };
    this.rules.push(record);
    return record;
  }

  async listActiveByEvent(organizationId: string, eventId: string) {
    return this.rules.filter(
      (r) =>
        r.organizationId === organizationId &&
        r.active &&
        (r.eventId === eventId || r.eventId === null),
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.rules
      .filter((r) => r.organizationId === organizationId && r.eventId === eventId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async listByOrganization(organizationId: string) {
    return this.rules
      .filter((r) => r.organizationId === organizationId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}

export class InMemoryOrderAttributionRepository implements OrderAttributionRepository {
  readonly attributions: OrderAttributionRecord[] = [];

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
    const record: OrderAttributionRecord = {
      id: nextId("att"),
      organizationId: data.organizationId,
      orderId: data.orderId,
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
    const index = this.attributions.findIndex((a) => a.orderId === data.orderId);
    if (index >= 0) this.attributions[index] = { ...record, id: this.attributions[index]!.id };
    else this.attributions.push(record);
  }

  async findByOrder(organizationId: string, orderId: string) {
    return (
      this.attributions.find(
        (a) => a.organizationId === organizationId && a.orderId === orderId,
      ) ?? null
    );
  }

  async countByPromoter(organizationId: string, promoterId: string) {
    return this.attributions.filter(
      (a) => a.organizationId === organizationId && a.promoterId === promoterId,
    ).length;
  }
}

export class InMemoryCommissionEntryRepository implements CommissionEntryRepository {
  readonly entries: (CommissionEntryRecord & { ruleSnapshot: unknown })[] = [];

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
    if (this.entries.some((e) => e.orderId === data.orderId && e.type === data.type)) {
      return false; // unique(orderId, type)
    }
    this.entries.push({
      id: nextId("cme"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      promoterId: data.promoterId,
      orderId: data.orderId,
      type: data.type,
      quantity: data.quantity,
      baseCents: data.baseCents,
      amountCents: data.amountCents,
      ruleSnapshot: data.ruleSnapshot,
    });
    return true;
  }

  async findByOrderAndType(
    organizationId: string,
    orderId: string,
    type: CommissionEntryType,
  ) {
    return (
      this.entries.find(
        (e) =>
          e.organizationId === organizationId && e.orderId === orderId && e.type === type,
      ) ?? null
    );
  }

  async summaryByEvent(organizationId: string, eventId: string): Promise<PromoterSummaryRow[]> {
    const map = new Map<string, PromoterSummaryRow>();
    for (const e of this.entries) {
      if (e.organizationId !== organizationId || e.eventId !== eventId) continue;
      const row = map.get(e.promoterId) ?? {
        promoterId: e.promoterId,
        quantity: 0,
        baseCents: 0,
        amountCents: 0,
      };
      row.quantity += e.quantity;
      row.baseCents += e.baseCents;
      row.amountCents += e.amountCents;
      map.set(e.promoterId, row);
    }
    return [...map.values()];
  }

  async summaryForPromoter(
    organizationId: string,
    promoterId: string,
  ): Promise<PromoterSummaryRow> {
    const row: PromoterSummaryRow = { promoterId, quantity: 0, baseCents: 0, amountCents: 0 };
    for (const e of this.entries) {
      if (e.organizationId !== organizationId || e.promoterId !== promoterId) continue;
      row.quantity += e.quantity;
      row.baseCents += e.baseCents;
      row.amountCents += e.amountCents;
    }
    return row;
  }

  async summaryForPromoterByEvent(
    organizationId: string,
    promoterId: string,
  ): Promise<PromoterEventSummaryRow[]> {
    const map = new Map<string, PromoterEventSummaryRow>();
    for (const e of this.entries) {
      if (e.organizationId !== organizationId || e.promoterId !== promoterId) continue;
      const row = map.get(e.eventId) ?? {
        eventId: e.eventId,
        promoterId,
        quantity: 0,
        baseCents: 0,
        amountCents: 0,
      };
      row.quantity += e.quantity;
      row.baseCents += e.baseCents;
      row.amountCents += e.amountCents;
      map.set(e.eventId, row);
    }
    return [...map.values()];
  }
}
