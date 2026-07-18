// In-memory fakes for the promoters module. They reproduce the invariants that
// matter for correctness: coupon redemption cap, one active rule per scope,
// and append-only commission entries idempotent per (orderId, type).

import type {
  CommissionEntryRepository,
  CommissionRuleRepository,
  CouponRepository,
  OrderAttributionRepository,
  PromoterAssignmentRepository,
  PromoterLinkRepository,
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
} from "../modules/promoters/types";
import { nextId } from "./fakes";

export class InMemoryPromoterAssignmentRepository implements PromoterAssignmentRepository {
  readonly assignments: PromoterAssignmentRecord[] = [];

  async create(data: { organizationId: string; eventId: string; membershipId: string }) {
    const existing = this.assignments.find(
      (a) => a.eventId === data.eventId && a.membershipId === data.membershipId,
    );
    if (existing) {
      existing.active = true;
      return existing;
    }
    const record: PromoterAssignmentRecord = {
      id: nextId("pas"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      membershipId: data.membershipId,
      active: true,
    };
    this.assignments.push(record);
    return record;
  }

  async findByEventAndMembership(
    organizationId: string,
    eventId: string,
    membershipId: string,
  ) {
    return (
      this.assignments.find(
        (a) =>
          a.organizationId === organizationId &&
          a.eventId === eventId &&
          a.membershipId === membershipId,
      ) ?? null
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.assignments.filter(
      (a) => a.organizationId === organizationId && a.eventId === eventId,
    );
  }
}

export class InMemoryPromoterLinkRepository implements PromoterLinkRepository {
  readonly links: PromoterLinkRecord[] = [];

  async create(data: {
    organizationId: string;
    eventId: string;
    membershipId: string;
    code: string;
  }) {
    const record: PromoterLinkRecord = {
      id: nextId("plk"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      membershipId: data.membershipId,
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

  async findByEventAndMembership(
    organizationId: string,
    eventId: string,
    membershipId: string,
  ) {
    return (
      this.links.find(
        (l) =>
          l.organizationId === organizationId &&
          l.eventId === eventId &&
          l.membershipId === membershipId,
      ) ?? null
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.links.filter(
      (l) => l.organizationId === organizationId && l.eventId === eventId,
    );
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
    eventId: string;
    code: string;
    type: CouponRecord["type"];
    value: number;
    membershipId?: string | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | undefined;
    maxRedemptions?: number | undefined;
  }) {
    const record: CouponRecord = {
      id: nextId("cpn"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      code: data.code,
      type: data.type,
      value: data.value,
      active: true,
      membershipId: data.membershipId ?? null,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      maxRedemptions: data.maxRedemptions ?? null,
      redemptions: 0,
    };
    this.coupons.push(record);
    return record;
  }

  async findByEventAndCode(organizationId: string, eventId: string, code: string) {
    return (
      this.coupons.find(
        (c) =>
          c.organizationId === organizationId && c.eventId === eventId && c.code === code,
      ) ?? null
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.coupons.filter(
      (c) => c.organizationId === organizationId && c.eventId === eventId,
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
    eventId: string;
    membershipId?: string | undefined;
    ticketTypeId?: string | undefined;
    type: CommissionRuleRecord["type"];
    value: number;
    base: CommissionRuleRecord["base"];
  }) {
    const membershipId = data.membershipId ?? null;
    const ticketTypeId = data.ticketTypeId ?? null;
    for (const rule of this.rules) {
      if (
        rule.organizationId === data.organizationId &&
        rule.eventId === data.eventId &&
        rule.membershipId === membershipId &&
        rule.ticketTypeId === ticketTypeId &&
        rule.active
      ) {
        rule.active = false;
      }
    }
    const record: CommissionRuleRecord & { createdAt: number } = {
      id: nextId("crl"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      membershipId,
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
      (r) => r.organizationId === organizationId && r.eventId === eventId && r.active,
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.rules
      .filter((r) => r.organizationId === organizationId && r.eventId === eventId)
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
    membershipId?: string | undefined;
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
      membershipId: data.membershipId ?? null,
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
}

export class InMemoryCommissionEntryRepository implements CommissionEntryRepository {
  readonly entries: (CommissionEntryRecord & { ruleSnapshot: unknown })[] = [];

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
    if (this.entries.some((e) => e.orderId === data.orderId && e.type === data.type)) {
      return false; // unique(orderId, type)
    }
    this.entries.push({
      id: nextId("cme"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      membershipId: data.membershipId,
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
      const row = map.get(e.membershipId) ?? {
        membershipId: e.membershipId,
        quantity: 0,
        baseCents: 0,
        amountCents: 0,
      };
      row.quantity += e.quantity;
      row.baseCents += e.baseCents;
      row.amountCents += e.amountCents;
      map.set(e.membershipId, row);
    }
    return [...map.values()];
  }

  async summaryForPromoter(
    organizationId: string,
    membershipId: string,
  ): Promise<PromoterSummaryRow> {
    const row: PromoterSummaryRow = { membershipId, quantity: 0, baseCents: 0, amountCents: 0 };
    for (const e of this.entries) {
      if (e.organizationId !== organizationId || e.membershipId !== membershipId) continue;
      row.quantity += e.quantity;
      row.baseCents += e.baseCents;
      row.amountCents += e.amountCents;
    }
    return row;
  }
}
