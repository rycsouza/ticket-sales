import { createHash } from "node:crypto";
import type { RequestContext } from "../../shared/context";
import { NotFoundOrForbiddenError } from "../../shared/errors";
import type { ClockPort } from "../../ports/clock";
import type { AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import type { CustomerRepository } from "./repository";
import type { SegmentFilterInput, SetOptOutInput } from "./schemas";
import { CRM_ROLES, RETENTION_MONTHS, type CustomerRecord, type SegmentResult } from "./types";

/** Paid-order aggregate + anonymization (implemented by OrderRepository). */
export interface CrmOrderReader {
  aggregatePaidByBuyer(
    organizationId: string,
    eventId?: string,
  ): Promise<{ buyerEmail: string; orderCount: number; totalCents: number }[]>;
  anonymizeBuyer(
    organizationId: string,
    email: string,
    pseudonym: { name: string; email: string },
  ): Promise<number>;
}

const ANON_NAME = "Comprador anonimizado";

/** Stable, non-reversible pseudonym so re-runs stay consistent + idempotent. */
function pseudonymFor(email: string): { name: string; email: string } {
  const digest = createHash("sha256").update(email.toLowerCase(), "utf8").digest("hex");
  return { name: ANON_NAME, email: `anon-${digest.slice(0, 20)}@anonimizado.local` };
}

export interface CustomersServiceDeps {
  customers: CustomerRepository;
  orders: CrmOrderReader;
  memberships: MembershipLookup;
  audit: AuditRepository;
  clock: ClockPort;
}

/** Consent captured at checkout (FR-CHK-012) — versioned string for the trail. */
export const CHECKOUT_CONSENT_VERSION = "checkout-terms-v1";

export class CustomersService {
  constructor(private readonly deps: CustomersServiceDeps) {}

  /**
   * Upserts the buyer into the CRM base on a paid order (FR-CRM-001). Records
   * the checkout consent; never flips opt-out. System actor (called by the
   * fulfiller), idempotent.
   */
  async upsertFromPaidOrder(order: {
    organizationId: string;
    buyerEmail: string;
    buyerName: string;
    buyerPhone: string | null;
    buyerDocument: string | null;
    paidAt: Date | null;
  }): Promise<void> {
    await this.deps.customers.upsert({
      organizationId: order.organizationId,
      email: order.buyerEmail,
      name: order.buyerName,
      phone: order.buyerPhone ?? undefined,
      document: order.buyerDocument ?? undefined,
      consentVersion: CHECKOUT_CONSENT_VERSION,
      consentAt: order.paidAt ?? this.deps.clock.now(),
      consentOrigin: "checkout",
      lastPurchaseAt: order.paidAt ?? this.deps.clock.now(),
    });
  }

  /**
   * DEC-010 (LGPD retention) — anonymize buyers with no purchase in the last
   * RETENTION_MONTHS. System job; idempotent (anonymizedAt excludes re-runs).
   * The financial ledger is untouched (it references orderId, not PII).
   */
  async runRetention(now: Date, limit = 200): Promise<number> {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
    const candidates = await this.deps.customers.listAnonymizationCandidates(cutoff, limit);

    let anonymized = 0;
    for (const customer of candidates) {
      await this.anonymizeRecord(customer, now, "retention");
      anonymized += 1;
    }
    return anonymized;
  }

  /** LGPD erasure on request (staff-initiated), audited. */
  async anonymizeCustomer(ctx: RequestContext, email: string): Promise<void> {
    await requireActiveRole(this.deps.memberships, ctx, CRM_ROLES);
    const customer = await this.deps.customers.findByEmail(ctx.organizationId, email);
    if (!customer) throw new NotFoundOrForbiddenError();
    await this.anonymizeRecord(customer, this.deps.clock.now(), "request", ctx.userId);
  }

  /**
   * Reproducible segment (FR-CRM-003/004/005): built from paid orders (source
   * of truth) enriched with CRM identity/consent. Opted-out buyers are excluded
   * unless explicitly included (FR-CRM-008).
   */
  async getSegment(ctx: RequestContext, filter: SegmentFilterInput): Promise<SegmentResult> {
    await requireActiveRole(this.deps.memberships, ctx, CRM_ROLES);
    return this.computeSegment(ctx.organizationId, filter);
  }

  /** FR-CRM-006/007 — same segment, but the read is audited (for export). */
  async getSegmentForExport(
    ctx: RequestContext,
    filter: SegmentFilterInput,
  ): Promise<SegmentResult> {
    await requireActiveRole(this.deps.memberships, ctx, CRM_ROLES);
    const result = await this.computeSegment(ctx.organizationId, filter);
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "crm.segment_exported",
      resourceType: "crm_segment",
      after: { filter, count: result.count },
      correlationId: ctx.correlationId,
    });
    return result;
  }

  /** FR-CRM-008 — set/clear a customer's opt-out (audited). */
  async setOptOut(ctx: RequestContext, input: SetOptOutInput): Promise<CustomerRecord> {
    await requireActiveRole(this.deps.memberships, ctx, CRM_ROLES);
    const customer = await this.deps.customers.setOptOut(
      ctx.organizationId,
      input.email,
      input.optedOut,
    );
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "crm.opt_out_changed",
      resourceType: "customer",
      resourceId: customer.id,
      after: { optedOut: input.optedOut },
      correlationId: ctx.correlationId,
    });
    return customer;
  }

  // -------------------------------------------------------------------------

  private async anonymizeRecord(
    customer: CustomerRecord,
    now: Date,
    origin: "retention" | "request",
    actorUserId?: string,
  ): Promise<void> {
    if (customer.anonymizedAt) return; // idempotent
    const pseudonym = pseudonymFor(customer.email);
    // Orders first (matched by the ORIGINAL e-mail), then the CRM record.
    await this.deps.orders.anonymizeBuyer(customer.organizationId, customer.email, pseudonym);
    await this.deps.customers.anonymize(customer.organizationId, customer.id, {
      email: pseudonym.email,
      name: pseudonym.name,
      anonymizedAt: now,
    });
    await this.deps.audit.append({
      organizationId: customer.organizationId,
      ...(actorUserId ? { actorUserId } : { actorType: "system" }),
      action: "crm.customer_anonymized",
      resourceType: "customer",
      resourceId: customer.id,
      after: { origin },
      correlationId: "retention",
    });
  }

  private async computeSegment(
    organizationId: string,
    filter: SegmentFilterInput,
  ): Promise<SegmentResult> {
    const aggregates = await this.deps.orders.aggregatePaidByBuyer(
      organizationId,
      filter.eventId,
    );
    const customers = await this.deps.customers.listByOrganization(organizationId);
    const byEmail = new Map(customers.map((c) => [c.email, c]));

    const rows = aggregates
      .map((agg) => {
        const customer = byEmail.get(agg.buyerEmail);
        return {
          email: agg.buyerEmail,
          name: customer?.name ?? null,
          phone: customer?.phone ?? null,
          optedOut: customer?.optedOut ?? false,
          orderCount: agg.orderCount,
          totalSpentCents: agg.totalCents,
        };
      })
      .filter((row) => {
        if (!filter.includeOptedOut && row.optedOut) return false;
        if (filter.minOrders !== undefined && row.orderCount < filter.minOrders) return false;
        if (filter.minSpentCents !== undefined && row.totalSpentCents < filter.minSpentCents) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.totalSpentCents - a.totalSpentCents);

    return {
      count: rows.length,
      totalSpentCents: rows.reduce((sum, r) => sum + r.totalSpentCents, 0),
      customers: rows,
    };
  }
}
