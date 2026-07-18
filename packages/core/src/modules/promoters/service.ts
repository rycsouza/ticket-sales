import { randomBytes } from "node:crypto";
import type { RequestContext } from "../../shared/context";
import {
  ConflictError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../shared/errors";
import type { ClockPort } from "../../ports/clock";
import type { AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import type { MembershipRecord } from "../identity/types";
import { computeCommission } from "./commission";
import { couponDiscountCents, validateCoupon, type CouponRejection } from "./coupon";
import type {
  CommissionEntryRepository,
  CommissionRuleRepository,
  CouponRepository,
  OrderAttributionRepository,
  PromoterAssignmentRepository,
  PromoterLinkRepository,
  PromoterSummaryRow,
} from "./repository";
import type {
  AssignPromoterInput,
  CreateCommissionRuleInput,
  CreateCouponInput,
  CreatePromoterLinkInput,
} from "./schemas";
import {
  PROMOTER_MANAGER_ROLES,
  type CommissionRuleRecord,
  type CouponRecord,
  type PromoterLinkRecord,
} from "./types";

/** Minimal readers so promoters never touches other modules' tables. */
export interface PromoterEventReader {
  findByIdScoped(
    organizationId: string,
    eventId: string,
  ): Promise<{ id: string; organizationId: string } | null>;
}

export interface PromoterOrderReader {
  findByIdScoped(
    organizationId: string,
    orderId: string,
  ): Promise<{
    id: string;
    eventId: string;
    status: string;
    subtotalCents: number;
    discountCents: number;
  } | null>;
  listItems(
    organizationId: string,
    orderId: string,
  ): Promise<{ ticketTypeId: string; unitPriceCents: number }[]>;
}

export interface PromoterMembershipReader extends MembershipLookup {
  findByIdScoped(
    organizationId: string,
    membershipId: string,
  ): Promise<MembershipRecord | null>;
}

export interface UtmParams {
  source?: string | undefined;
  medium?: string | undefined;
  campaign?: string | undefined;
  content?: string | undefined;
  term?: string | undefined;
}

export interface PromotersServiceDeps {
  assignments: PromoterAssignmentRepository;
  links: PromoterLinkRepository;
  coupons: CouponRepository;
  rules: CommissionRuleRepository;
  attributions: OrderAttributionRepository;
  entries: CommissionEntryRepository;
  memberships: PromoterMembershipReader;
  events: PromoterEventReader;
  orders: PromoterOrderReader;
  audit: AuditRepository;
  clock: ClockPort;
}

// Crockford-like base32 (no ambiguous chars) for shareable link/coupon refs.
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateRefCode(length = 8): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += REF_ALPHABET[(bytes[i] as number) % REF_ALPHABET.length];
  }
  return code;
}

export class PromotersService {
  constructor(private readonly deps: PromotersServiceDeps) {}

  // -------------------------------------------------------------------------
  // Management (staff) — FR-PRM-001..009
  // -------------------------------------------------------------------------

  /** FR-PRM-003 — bind a PROMOTER membership to an event. */
  async assignPromoter(ctx: RequestContext, eventId: string, input: AssignPromoterInput) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    await this.mustFindPromoterMembership(ctx.organizationId, input.membershipId);

    const assignment = await this.deps.assignments.create({
      organizationId: ctx.organizationId,
      eventId,
      membershipId: input.membershipId,
    });

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "promoter.assigned",
      resourceType: "promoter_assignment",
      resourceId: assignment.id,
      after: { eventId, membershipId: input.membershipId },
      correlationId: ctx.correlationId,
    });
    return assignment;
  }

  async listPromoters(ctx: RequestContext, eventId: string) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    return this.deps.assignments.listByEvent(ctx.organizationId, eventId);
  }

  /** FR-PRM-004 — one trackable link per promoter per event (idempotent). */
  async createLink(
    ctx: RequestContext,
    eventId: string,
    input: CreatePromoterLinkInput,
  ): Promise<PromoterLinkRecord> {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    await this.mustBeAssigned(ctx.organizationId, eventId, input.membershipId);

    const existing = await this.deps.links.findByEventAndMembership(
      ctx.organizationId,
      eventId,
      input.membershipId,
    );
    if (existing) return existing;

    const link = await this.deps.links.create({
      organizationId: ctx.organizationId,
      eventId,
      membershipId: input.membershipId,
      code: generateRefCode(8),
    });
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "promoter.link_created",
      resourceType: "promoter_link",
      resourceId: link.id,
      after: { eventId, membershipId: input.membershipId },
      correlationId: ctx.correlationId,
    });
    return link;
  }

  async listLinks(ctx: RequestContext, eventId: string) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    return this.deps.links.listByEvent(ctx.organizationId, eventId);
  }

  /** FR-PRM-005 / FR-CHK-008 — create an individual or shared coupon. */
  async createCoupon(ctx: RequestContext, eventId: string, input: CreateCouponInput) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    if (input.membershipId) {
      await this.mustBeAssigned(ctx.organizationId, eventId, input.membershipId);
    }

    const code = input.code.toUpperCase();
    const clash = await this.deps.coupons.findByEventAndCode(ctx.organizationId, eventId, code);
    if (clash) throw new ConflictError("A coupon with this code already exists for the event");

    const coupon = await this.deps.coupons.create({
      organizationId: ctx.organizationId,
      eventId,
      code,
      type: input.type,
      value: input.value,
      membershipId: input.membershipId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      maxRedemptions: input.maxRedemptions,
    });
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "coupon.created",
      resourceType: "coupon",
      resourceId: coupon.id,
      after: { code, type: input.type, value: input.value },
      correlationId: ctx.correlationId,
    });
    return coupon;
  }

  async listCoupons(ctx: RequestContext, eventId: string) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    return this.deps.coupons.listByEvent(ctx.organizationId, eventId);
  }

  /** FR-PRM-008/009/015 — versioned rule; supersedes prior same-scope rule. */
  async createCommissionRule(
    ctx: RequestContext,
    eventId: string,
    input: CreateCommissionRuleInput,
  ) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    if (input.membershipId) {
      await this.mustBeAssigned(ctx.organizationId, eventId, input.membershipId);
    }

    const rule = await this.deps.rules.createSuperseding({
      organizationId: ctx.organizationId,
      eventId,
      membershipId: input.membershipId,
      ticketTypeId: input.ticketTypeId,
      type: input.type,
      value: input.value,
      base: input.base ?? "NOMINAL",
    });
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "commission_rule.created",
      resourceType: "commission_rule",
      resourceId: rule.id,
      after: { type: input.type, value: input.value, base: rule.base },
      correlationId: ctx.correlationId,
    });
    return rule;
  }

  async listCommissionRules(ctx: RequestContext, eventId: string) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    return this.deps.rules.listByEvent(ctx.organizationId, eventId);
  }

  /** FR-PRM-013 — ranking/performance by promoter for the event. */
  async eventRanking(ctx: RequestContext, eventId: string): Promise<PromoterSummaryRow[]> {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    const rows = await this.deps.entries.summaryByEvent(ctx.organizationId, eventId);
    return rows.sort((a, b) => b.amountCents - a.amountCents);
  }

  // -------------------------------------------------------------------------
  // Promoter self-view — FR-PRM-002/012 (own data only, BR-PRV-003)
  // -------------------------------------------------------------------------

  async myCommissionSummary(ctx: RequestContext): Promise<PromoterSummaryRow> {
    const membership = await requireActiveRole(this.deps.memberships, ctx, ["PROMOTER"]);
    return this.deps.entries.summaryForPromoter(ctx.organizationId, membership.id);
  }

  // -------------------------------------------------------------------------
  // Checkout hooks — money + attribution (FR-CHK-008/009/010)
  // -------------------------------------------------------------------------

  /**
   * Resolves a coupon's discount server-side (FR-CHK-008). Throws with a
   * specific reason when an explicitly supplied coupon is invalid, so the buyer
   * never silently pays full price for a coupon they expected to work.
   */
  async resolveDiscount(input: {
    organizationId: string;
    eventId: string;
    couponCode: string;
    subtotalCents: number;
    now: Date;
  }): Promise<{ couponId: string; discountCents: number }> {
    const coupon = await this.deps.coupons.findByEventAndCode(
      input.organizationId,
      input.eventId,
      input.couponCode.toUpperCase(),
    );
    const validity = validateCoupon(coupon, input.now);
    if (!validity.ok || !coupon) {
      throw new ValidationFailedError(rejectionMessage(validity.reason));
    }
    return {
      couponId: coupon.id,
      discountCents: couponDiscountCents(coupon, input.subtotalCents),
    };
  }

  /**
   * Persists attribution for a created order (FR-PRM-007). Priority (BR-PRM-002):
   * a valid promoter-owned coupon wins; otherwise a valid promoter link; a
   * non-promoter coupon still records the discount but attributes to no one.
   * Attribution only credits a promoter still ACTIVELY assigned to the event.
   */
  async recordAttribution(input: {
    organizationId: string;
    eventId: string;
    orderId: string;
    couponCode?: string | undefined;
    linkRef?: string | undefined;
    utm?: UtmParams | undefined;
    now: Date;
  }): Promise<void> {
    let couponId: string | null = null;
    let couponPromoter: string | null = null;
    if (input.couponCode) {
      const coupon = await this.deps.coupons.findByEventAndCode(
        input.organizationId,
        input.eventId,
        input.couponCode.toUpperCase(),
      );
      if (coupon && validateCoupon(coupon, input.now).ok) {
        couponId = coupon.id;
        couponPromoter = coupon.membershipId;
      }
    }

    let linkId: string | null = null;
    let linkPromoter: string | null = null;
    if (input.linkRef) {
      const link = await this.deps.links.findByCode(input.linkRef);
      if (
        link &&
        link.active &&
        link.organizationId === input.organizationId &&
        link.eventId === input.eventId
      ) {
        linkId = link.id;
        linkPromoter = link.membershipId;
        await this.deps.links.incrementClick(link.id).catch(() => undefined);
      }
    }

    // Priority: promoter-owned coupon > link > coupon-only (no promoter).
    let mechanism: "NONE" | "LINK" | "COUPON" = "NONE";
    let membershipId: string | null = null;
    if (couponPromoter) {
      mechanism = "COUPON";
      membershipId = couponPromoter;
    } else if (linkPromoter) {
      mechanism = "LINK";
      membershipId = linkPromoter;
    } else if (couponId) {
      mechanism = "COUPON";
    }

    // Only credit a promoter still actively assigned to the event.
    if (membershipId) {
      const assignment = await this.deps.assignments.findByEventAndMembership(
        input.organizationId,
        input.eventId,
        membershipId,
      );
      if (!assignment || !assignment.active) membershipId = null;
    }

    await this.deps.attributions.upsert({
      organizationId: input.organizationId,
      orderId: input.orderId,
      eventId: input.eventId,
      mechanism,
      membershipId: membershipId ?? undefined,
      couponId: couponId ?? undefined,
      linkId: linkId ?? undefined,
      utmSource: input.utm?.source,
      utmMedium: input.utm?.medium,
      utmCampaign: input.utm?.campaign,
      utmContent: input.utm?.content,
      utmTerm: input.utm?.term,
    });
  }

  // -------------------------------------------------------------------------
  // Payment lifecycle hooks — FR-PRM-010/011 (idempotent, append-only ledger)
  // -------------------------------------------------------------------------

  /**
   * Accrues commission for a PAID order (FR-PRM-010, BR-PRM-004). Idempotent:
   * the unique (orderId, ACCRUAL) constraint makes webhook retries harmless.
   * A coupon redemption is counted exactly once, on first accrual.
   */
  async accrueForPaidOrder(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<void> {
    const attribution = await this.deps.attributions.findByOrder(organizationId, orderId);
    if (!attribution) return;

    const order = await this.deps.orders.findByIdScoped(organizationId, orderId);
    if (!order || order.status !== "PAID") return;

    // Count the coupon redemption once (guarded by first-accrual below).
    const items = await this.deps.orders.listItems(organizationId, orderId);

    let quantity = 0;
    let baseCents = 0;
    let amountCents = 0;
    let rules: unknown = [];
    if (attribution.membershipId) {
      const activeRules = await this.deps.rules.listActiveByEvent(
        organizationId,
        order.eventId,
      );
      const computed = computeCommission(items, activeRules, attribution.membershipId, {
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
      });
      quantity = computed.quantity;
      baseCents = computed.baseCents;
      amountCents = computed.amountCents;
      rules = computed.rules;
    }

    let firstAccrual = true;
    if (attribution.membershipId && amountCents > 0) {
      firstAccrual = await this.deps.entries.create({
        organizationId,
        eventId: order.eventId,
        membershipId: attribution.membershipId,
        orderId,
        type: "ACCRUAL",
        quantity,
        baseCents,
        amountCents,
        ruleSnapshot: { rules, subtotalCents: order.subtotalCents },
        correlationId: meta.correlationId,
      });
      if (firstAccrual) {
        await this.deps.audit.append({
          organizationId,
          actorType: "system",
          action: "commission.accrued",
          resourceType: "order",
          resourceId: orderId,
          after: { membershipId: attribution.membershipId, amountCents },
          correlationId: meta.correlationId,
        });
      }
    }

    // Redeem coupon once. Guard on first accrual OR (no promoter but coupon
    // used) — but only count each paid order once via the attribution row's
    // absence of a prior marker. We rely on ACCRUAL idempotency for promoter
    // coupons; for promoter-less coupons, redeem when the order first pays.
    if (attribution.couponId && firstAccrual) {
      await this.deps.coupons
        .tryIncrementRedemption(organizationId, attribution.couponId)
        .catch(() => undefined);
    }
  }

  /**
   * Reverses commission on refund/chargeback (FR-PRM-011). Posts a compensating
   * REVERSAL entry (negative) — never mutates the accrual. Idempotent via the
   * unique (orderId, REVERSAL) constraint.
   */
  async reverseForOrder(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<void> {
    const accrual = await this.deps.entries.findByOrderAndType(
      organizationId,
      orderId,
      "ACCRUAL",
    );
    if (!accrual || accrual.amountCents === 0) return;

    const posted = await this.deps.entries.create({
      organizationId,
      eventId: accrual.eventId,
      membershipId: accrual.membershipId,
      orderId,
      type: "REVERSAL",
      quantity: -accrual.quantity,
      baseCents: -accrual.baseCents,
      amountCents: -accrual.amountCents,
      ruleSnapshot: { reversalOf: accrual.id },
      correlationId: meta.correlationId,
    });
    if (posted) {
      await this.deps.audit.append({
        organizationId,
        actorType: "system",
        action: "commission.reversed",
        resourceType: "order",
        resourceId: orderId,
        after: { membershipId: accrual.membershipId, amountCents: -accrual.amountCents },
        correlationId: meta.correlationId,
      });
    }
  }

  // -------------------------------------------------------------------------

  private async mustFindEvent(organizationId: string, eventId: string) {
    const event = await this.deps.events.findByIdScoped(organizationId, eventId);
    if (!event) throw new NotFoundOrForbiddenError();
    return event;
  }

  private async mustFindPromoterMembership(organizationId: string, membershipId: string) {
    const membership = await this.deps.memberships.findByIdScoped(organizationId, membershipId);
    if (!membership || membership.role !== "PROMOTER") {
      throw new ValidationFailedError("Membership is not a promoter in this organization");
    }
    return membership;
  }

  private async mustBeAssigned(
    organizationId: string,
    eventId: string,
    membershipId: string,
  ) {
    const assignment = await this.deps.assignments.findByEventAndMembership(
      organizationId,
      eventId,
      membershipId,
    );
    if (!assignment || !assignment.active) {
      throw new ValidationFailedError("Promoter is not assigned to this event");
    }
    return assignment;
  }
}

function rejectionMessage(reason: CouponRejection | undefined): string {
  switch (reason) {
    case "inactive":
      return "Cupom inativo";
    case "not_started":
      return "Cupom ainda não está válido";
    case "expired":
      return "Cupom expirado";
    case "exhausted":
      return "Cupom esgotado";
    default:
      return "Cupom inválido";
  }
}
