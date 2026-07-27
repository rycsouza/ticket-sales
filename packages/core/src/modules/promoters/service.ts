import { randomBytes } from "node:crypto";
import type { RequestContext } from "../../shared/context";
import {
  ConflictError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../shared/errors";
import { generateToken, hashToken } from "../../shared/tokens";
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
  PromoterRepository,
  PromoterSummaryRow,
} from "./repository";
import type {
  CreateCommissionRuleInput,
  CreateCouponInput,
  CreatePromoterInput,
  CreatePromoterLinkInput,
  LinkPromoterInput,
  PromoteToLoginInput,
} from "./schemas";
import {
  PROMOTER_MANAGER_ROLES,
  type CommissionRuleRecord,
  type CouponRecord,
  type PromoterLinkRecord,
  type PromoterRecord,
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
  ): Promise<{ ticketTypeId: string | null; unitPriceCents: number }[]>;
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

export interface PromoterReport {
  promoter: { id: string; name: string; active: boolean };
  clicks: number;
  attributedOrders: number;
  commissionQuantity: number;
  commissionAmountCents: number;
  byEvent: { eventId: string; quantity: number; amountCents: number }[];
}

export interface PromotersServiceDeps {
  promoters: PromoterRepository;
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
  // Promoter registry (org-level) — FR-PRM-001/002
  // -------------------------------------------------------------------------

  /**
   * Registers a lightweight promoter (no login). Returns the raw report token
   * ONCE — only its hash is stored. The token backs the promoter's private
   * report link and can never be recovered (only regenerated).
   */
  async createPromoter(
    ctx: RequestContext,
    input: CreatePromoterInput,
  ): Promise<{ promoter: PromoterRecord; reportToken: string }> {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    const reportToken = generateToken();
    const promoter = await this.deps.promoters.create({
      organizationId: ctx.organizationId,
      name: input.name,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      reportTokenHash: hashToken(reportToken),
    });
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "promoter.created",
      resourceType: "promoter",
      resourceId: promoter.id,
      after: { name: input.name },
      correlationId: ctx.correlationId,
    });
    return { promoter, reportToken };
  }

  async listPromoters(ctx: RequestContext): Promise<PromoterRecord[]> {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    return this.deps.promoters.listByOrganization(ctx.organizationId);
  }

  async getPromoter(ctx: RequestContext, promoterId: string): Promise<PromoterRecord> {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    return this.mustFindPromoter(ctx.organizationId, promoterId);
  }

  /** Links a lightweight promoter to a login account (a PROMOTER membership). */
  async promoteToLogin(ctx: RequestContext, promoterId: string, input: PromoteToLoginInput) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindPromoter(ctx.organizationId, promoterId);
    const membership = await this.deps.memberships.findByIdScoped(
      ctx.organizationId,
      input.membershipId,
    );
    if (!membership || membership.role !== "PROMOTER") {
      throw new ValidationFailedError("Membership is not a promoter in this organization");
    }
    const existing = await this.deps.promoters.findByMembership(
      ctx.organizationId,
      input.membershipId,
    );
    if (existing && existing.id !== promoterId) {
      throw new ConflictError("This login is already linked to another promoter");
    }
    await this.deps.promoters.attachMembership(ctx.organizationId, promoterId, input.membershipId);
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "promoter.promoted_to_login",
      resourceType: "promoter",
      resourceId: promoterId,
      after: { membershipId: input.membershipId },
      correlationId: ctx.correlationId,
    });
  }

  /** Rotates the report token — invalidates the previous private link. */
  async regenerateReportToken(ctx: RequestContext, promoterId: string): Promise<string> {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindPromoter(ctx.organizationId, promoterId);
    const reportToken = generateToken();
    await this.deps.promoters.updateReportTokenHash(
      ctx.organizationId,
      promoterId,
      hashToken(reportToken),
    );
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "promoter.report_token_regenerated",
      resourceType: "promoter",
      resourceId: promoterId,
      correlationId: ctx.correlationId,
    });
    return reportToken;
  }

  // -------------------------------------------------------------------------
  // Event linking + links (FR-PRM-003/004)
  // -------------------------------------------------------------------------

  /** FR-PRM-003 — bind a promoter to an event. */
  async linkPromoterToEvent(ctx: RequestContext, eventId: string, input: LinkPromoterInput) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    await this.mustFindPromoter(ctx.organizationId, input.promoterId);

    const assignment = await this.deps.assignments.create({
      organizationId: ctx.organizationId,
      eventId,
      promoterId: input.promoterId,
    });
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "promoter.assigned",
      resourceType: "promoter_assignment",
      resourceId: assignment.id,
      after: { eventId, promoterId: input.promoterId },
      correlationId: ctx.correlationId,
    });
    return assignment;
  }

  async listEventAssignments(ctx: RequestContext, eventId: string) {
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
    await this.mustBeAssigned(ctx.organizationId, eventId, input.promoterId);

    const existing = await this.deps.links.findByEventAndPromoter(
      ctx.organizationId,
      eventId,
      input.promoterId,
    );
    if (existing) return existing;

    const link = await this.deps.links.create({
      organizationId: ctx.organizationId,
      eventId,
      promoterId: input.promoterId,
      code: generateRefCode(8),
    });
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "promoter.link_created",
      resourceType: "promoter_link",
      resourceId: link.id,
      after: { eventId, promoterId: input.promoterId },
      correlationId: ctx.correlationId,
    });
    return link;
  }

  async listLinks(ctx: RequestContext, eventId: string) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    return this.deps.links.listByEvent(ctx.organizationId, eventId);
  }

  // -------------------------------------------------------------------------
  // Coupons & rules — org-level (eventId null) or event-scoped
  // -------------------------------------------------------------------------

  /**
   * Creates a coupon. `eventId === null` makes an organization-wide default
   * (applies to every event unless an event-scoped coupon of the same code
   * shadows it). Promoter-owned event coupons require the promoter to be
   * assigned to the event.
   */
  async createCoupon(
    ctx: RequestContext,
    eventId: string | null,
    input: CreateCouponInput,
  ) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    if (eventId) await this.mustFindEvent(ctx.organizationId, eventId);
    if (input.promoterId) {
      if (eventId) await this.mustBeAssigned(ctx.organizationId, eventId, input.promoterId);
      else await this.mustFindPromoter(ctx.organizationId, input.promoterId);
    }

    const code = input.code.toUpperCase();
    const clash = await this.deps.coupons.findByCode(ctx.organizationId, eventId, code);
    if (clash) {
      throw new ConflictError(
        eventId
          ? "A coupon with this code already exists for the event"
          : "A default coupon with this code already exists",
      );
    }

    const coupon = await this.deps.coupons.create({
      organizationId: ctx.organizationId,
      eventId,
      code,
      type: input.type,
      value: input.value,
      promoterId: input.promoterId,
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
      after: { code, type: input.type, value: input.value, eventId },
      correlationId: ctx.correlationId,
    });
    return coupon;
  }

  async listCoupons(ctx: RequestContext, eventId: string) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    return this.deps.coupons.listByEvent(ctx.organizationId, eventId);
  }

  async listOrgCoupons(ctx: RequestContext) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    return this.deps.coupons.listByOrganization(ctx.organizationId);
  }

  /** FR-PRM-008/009/015 — versioned rule; supersedes prior same-scope rule. */
  async createCommissionRule(
    ctx: RequestContext,
    eventId: string | null,
    input: CreateCommissionRuleInput,
  ) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    if (eventId) await this.mustFindEvent(ctx.organizationId, eventId);
    if (input.promoterId) {
      if (eventId) await this.mustBeAssigned(ctx.organizationId, eventId, input.promoterId);
      else await this.mustFindPromoter(ctx.organizationId, input.promoterId);
    }

    const rule = await this.deps.rules.createSuperseding({
      organizationId: ctx.organizationId,
      eventId,
      promoterId: input.promoterId,
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
      after: { type: input.type, value: input.value, base: rule.base, eventId },
      correlationId: ctx.correlationId,
    });
    return rule;
  }

  async listCommissionRules(ctx: RequestContext, eventId: string) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    return this.deps.rules.listByEvent(ctx.organizationId, eventId);
  }

  async listOrgCommissionRules(ctx: RequestContext) {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    return this.deps.rules.listByOrganization(ctx.organizationId);
  }

  /** FR-PRM-013 — ranking/performance by promoter for the event. */
  async eventRanking(ctx: RequestContext, eventId: string): Promise<PromoterSummaryRow[]> {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    const rows = await this.deps.entries.summaryByEvent(ctx.organizationId, eventId);
    return rows.sort((a, b) => b.amountCents - a.amountCents);
  }

  // -------------------------------------------------------------------------
  // Reports — FR-PRM-012/013 (own data only, BR-PRV-003)
  // -------------------------------------------------------------------------

  /** Staff-facing report for a promoter. */
  async getPromoterReport(ctx: RequestContext, promoterId: string): Promise<PromoterReport> {
    await requireActiveRole(this.deps.memberships, ctx, PROMOTER_MANAGER_ROLES);
    const promoter = await this.mustFindPromoter(ctx.organizationId, promoterId);
    return this.buildReport(promoter);
  }

  /**
   * Public tokenized report (the token is the capability). Resolves the promoter
   * by report-token hash — enumeration-proof (256-bit token, only the hash is
   * queryable) and returns ONLY that promoter's own aggregates.
   */
  async getPromoterReportByToken(rawToken: string): Promise<PromoterReport | null> {
    if (!rawToken || rawToken.length < 16) return null;
    const promoter = await this.deps.promoters.findByReportTokenHash(hashToken(rawToken));
    if (!promoter || !promoter.active) return null;
    return this.buildReport(promoter);
  }

  private async buildReport(promoter: PromoterRecord): Promise<PromoterReport> {
    const [clicks, attributedOrders, summary, byEvent] = await Promise.all([
      this.deps.links.sumClicksByPromoter(promoter.organizationId, promoter.id),
      this.deps.attributions.countByPromoter(promoter.organizationId, promoter.id),
      this.deps.entries.summaryForPromoter(promoter.organizationId, promoter.id),
      this.deps.entries.summaryForPromoterByEvent(promoter.organizationId, promoter.id),
    ]);
    return {
      promoter: { id: promoter.id, name: promoter.name, active: promoter.active },
      clicks,
      attributedOrders,
      commissionQuantity: summary.quantity,
      commissionAmountCents: summary.amountCents,
      byEvent: byEvent
        .map((r) => ({ eventId: r.eventId, quantity: r.quantity, amountCents: r.amountCents }))
        .sort((a, b) => b.amountCents - a.amountCents),
    };
  }

  /** Promoter self-view (login account) — resolves the promoter via membership. */
  async myReport(ctx: RequestContext): Promise<PromoterReport> {
    const membership = await requireActiveRole(this.deps.memberships, ctx, ["PROMOTER"]);
    const promoter = await this.deps.promoters.findByMembership(ctx.organizationId, membership.id);
    if (!promoter) throw new NotFoundOrForbiddenError();
    return this.buildReport(promoter);
  }

  // -------------------------------------------------------------------------
  // Checkout hooks — money + attribution (FR-CHK-008/009/010)
  // -------------------------------------------------------------------------

  async resolveDiscount(input: {
    organizationId: string;
    eventId: string;
    couponCode: string;
    subtotalCents: number;
    now: Date;
  }): Promise<{ couponId: string; discountCents: number }> {
    const coupon = await this.deps.coupons.resolveByCode(
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

  async previewCoupon(input: {
    organizationId: string;
    eventId: string;
    code: string;
    now: Date;
  }): Promise<
    | { valid: true; type: "PERCENT" | "FIXED"; value: number }
    | { valid: false; reason: CouponRejection }
  > {
    const coupon = await this.deps.coupons.resolveByCode(
      input.organizationId,
      input.eventId,
      input.code.toUpperCase(),
    );
    const validity = validateCoupon(coupon, input.now);
    if (!validity.ok || !coupon) {
      return { valid: false, reason: validity.reason ?? "not_found" };
    }
    return { valid: true, type: coupon.type, value: coupon.value };
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
      const coupon = await this.deps.coupons.resolveByCode(
        input.organizationId,
        input.eventId,
        input.couponCode.toUpperCase(),
      );
      if (coupon && validateCoupon(coupon, input.now).ok) {
        couponId = coupon.id;
        couponPromoter = coupon.promoterId;
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
        linkPromoter = link.promoterId;
        await this.deps.links.incrementClick(link.id).catch(() => undefined);
      }
    }

    // Priority: promoter-owned coupon > link > coupon-only (no promoter).
    let mechanism: "NONE" | "LINK" | "COUPON" = "NONE";
    let promoterId: string | null = null;
    if (couponPromoter) {
      mechanism = "COUPON";
      promoterId = couponPromoter;
    } else if (linkPromoter) {
      mechanism = "LINK";
      promoterId = linkPromoter;
    } else if (couponId) {
      mechanism = "COUPON";
    }

    // Only credit a promoter still actively assigned to the event.
    if (promoterId) {
      const assignment = await this.deps.assignments.findByEventAndPromoter(
        input.organizationId,
        input.eventId,
        promoterId,
      );
      if (!assignment || !assignment.active) promoterId = null;
    }

    await this.deps.attributions.upsert({
      organizationId: input.organizationId,
      orderId: input.orderId,
      eventId: input.eventId,
      mechanism,
      promoterId: promoterId ?? undefined,
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

  async accrueForPaidOrder(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<void> {
    const attribution = await this.deps.attributions.findByOrder(organizationId, orderId);
    if (!attribution) return;

    const order = await this.deps.orders.findByIdScoped(organizationId, orderId);
    if (!order || order.status !== "PAID") return;

    // Only ticket units earn commission — standalone add-ons (upsell / order
    // bump PRODUCT lines, ticketTypeId null) are excluded.
    const items = (await this.deps.orders.listItems(organizationId, orderId)).filter(
      (item): item is { ticketTypeId: string; unitPriceCents: number } => item.ticketTypeId !== null,
    );

    let quantity = 0;
    let baseCents = 0;
    let amountCents = 0;
    let rules: unknown = [];
    if (attribution.promoterId) {
      const activeRules = await this.deps.rules.listActiveByEvent(organizationId, order.eventId);
      const computed = computeCommission(items, activeRules, attribution.promoterId, {
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
      });
      quantity = computed.quantity;
      baseCents = computed.baseCents;
      amountCents = computed.amountCents;
      rules = computed.rules;
    }

    let firstAccrual = true;
    if (attribution.promoterId && amountCents > 0) {
      firstAccrual = await this.deps.entries.create({
        organizationId,
        eventId: order.eventId,
        promoterId: attribution.promoterId,
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
          after: { promoterId: attribution.promoterId, amountCents },
          correlationId: meta.correlationId,
        });
      }
    }

    if (attribution.couponId && firstAccrual) {
      await this.deps.coupons
        .tryIncrementRedemption(organizationId, attribution.couponId)
        .catch(() => undefined);
    }
  }

  async reverseForOrder(
    organizationId: string,
    orderId: string,
    meta: { correlationId: string },
  ): Promise<void> {
    const accrual = await this.deps.entries.findByOrderAndType(organizationId, orderId, "ACCRUAL");
    if (!accrual || accrual.amountCents === 0) return;

    const posted = await this.deps.entries.create({
      organizationId,
      eventId: accrual.eventId,
      promoterId: accrual.promoterId,
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
        after: { promoterId: accrual.promoterId, amountCents: -accrual.amountCents },
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

  private async mustFindPromoter(organizationId: string, promoterId: string) {
    const promoter = await this.deps.promoters.findById(organizationId, promoterId);
    if (!promoter) throw new NotFoundOrForbiddenError();
    return promoter;
  }

  private async mustBeAssigned(organizationId: string, eventId: string, promoterId: string) {
    const assignment = await this.deps.assignments.findByEventAndPromoter(
      organizationId,
      eventId,
      promoterId,
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
