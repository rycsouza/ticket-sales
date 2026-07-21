import { createHash } from "node:crypto";
import type { RequestContext } from "../../shared/context";
import { NotFoundOrForbiddenError } from "../../shared/errors";
import type { ClockPort } from "../../ports/clock";
import type { AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import type { CustomerRepository } from "./repository";
import type { SegmentFilterInput, SetOptOutInput } from "./schemas";
import {
  CRM_ROLES,
  LEAD_RETENTION_MONTHS,
  RETENTION_MONTHS,
  type CustomerRecord,
  type SegmentResult,
} from "./types";

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

/** Public masked preview of an existing customer (never exposes full PII). */
export interface CustomerLookupResult {
  found: boolean;
  maskedName: string | null;
  maskedEmail: string | null;
}

/** Digits only — the stable key for matching a buyer's phone across formats. */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

function maskName(name: string | null): string {
  if (!name) return "Cliente";
  const first = name.trim().split(/\s+/)[0] ?? "Cliente";
  return `${first} ***`;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const head = local.length <= 3 ? local.slice(0, 1) : local.slice(0, 4);
  return `${head}***@${domain}`;
}

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
    const phone = order.buyerPhone ? normalizePhone(order.buyerPhone) : "";
    await this.deps.customers.upsert({
      organizationId: order.organizationId,
      email: order.buyerEmail,
      name: order.buyerName,
      phone: phone.length >= 8 ? phone : undefined,
      document: order.buyerDocument ?? undefined,
      consentVersion: CHECKOUT_CONSENT_VERSION,
      consentAt: order.paidAt ?? this.deps.clock.now(),
      consentOrigin: "checkout",
      lastPurchaseAt: order.paidAt ?? this.deps.clock.now(),
    });
  }

  /**
   * Capture a checkout LEAD — a person who entered contact data before paying
   * (mid/bottom funnel). Never overwrites an existing contact (avoids
   * unauthenticated tampering); only brand-new contacts are added, and no
   * lastPurchaseAt is set (a lead is not a purchase). System method (no ctx):
   * the organization is resolved from the published event at the edge.
   */
  async captureLead(input: {
    organizationId: string;
    email: string;
    name: string;
    phone: string | null;
  }): Promise<void> {
    const email = input.email.trim().toLowerCase();
    if (!email) return;
    const existing = await this.deps.customers.findByEmail(input.organizationId, email);
    if (existing) return;
    const phone = input.phone ? normalizePhone(input.phone) : "";
    await this.deps.customers.upsert({
      organizationId: input.organizationId,
      email,
      name: input.name.trim() || undefined,
      phone: phone.length >= 8 ? phone : undefined,
      consentVersion: CHECKOUT_CONSENT_VERSION,
      consentAt: this.deps.clock.now(),
      consentOrigin: "checkout-lead",
    });
  }

  /**
   * Public checkout lookup by phone — returns ONLY a masked preview so an
   * unauthenticated caller can't harvest full contact data. The endpoint that
   * exposes this must be rate-limited (anti-enumeration).
   */
  async lookupByPhone(organizationId: string, phoneRaw: string): Promise<CustomerLookupResult> {
    const empty: CustomerLookupResult = { found: false, maskedName: null, maskedEmail: null };
    const phone = normalizePhone(phoneRaw);
    if (phone.length < 8) return empty;
    const customer = await this.deps.customers.findByPhone(organizationId, phone);
    if (!customer) return empty;
    return {
      found: true,
      maskedName: maskName(customer.name),
      maskedEmail: maskEmail(customer.email),
    };
  }

  /**
   * Server-only resolution of the real buyer identity from a phone, for reusing
   * a known customer at checkout. NEVER exposed to the client (the public path
   * only ever sees the masked preview above).
   */
  async resolveByPhone(
    organizationId: string,
    phoneRaw: string,
  ): Promise<{ name: string; email: string } | null> {
    const phone = normalizePhone(phoneRaw);
    if (phone.length < 8) return null;
    const customer = await this.deps.customers.findByPhone(organizationId, phone);
    if (!customer || !customer.name) return null;
    return { name: customer.name, email: customer.email };
  }

  /**
   * DEC-010 (LGPD retention) — anonymize buyers with no purchase in the last
   * RETENTION_MONTHS. System job; idempotent (anonymizedAt excludes re-runs).
   * The financial ledger is untouched (it references orderId, not PII).
   */
  async runRetention(now: Date, limit = 200): Promise<number> {
    const buyerCutoff = new Date(now);
    buyerCutoff.setMonth(buyerCutoff.getMonth() - RETENTION_MONTHS);
    const buyers = await this.deps.customers.listAnonymizationCandidates(buyerCutoff, limit);

    let anonymized = 0;
    for (const customer of buyers) {
      await this.anonymizeRecord(customer, now, "retention");
      anonymized += 1;
    }

    // Leads (no purchase) age out faster — 12 months from consent capture.
    const remaining = limit - anonymized;
    if (remaining > 0) {
      const leadCutoff = new Date(now);
      leadCutoff.setMonth(leadCutoff.getMonth() - LEAD_RETENTION_MONTHS);
      const leads = await this.deps.customers.listLeadAnonymizationCandidates(leadCutoff, remaining);
      for (const lead of leads) {
        await this.anonymizeRecord(lead, now, "retention");
        anonymized += 1;
      }
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
    const aggByEmail = new Map(aggregates.map((a) => [a.buyerEmail, a]));

    // Default: paid buyers only. `includeLeads` (only without an event filter)
    // also surfaces contacts with no paid order — checkout leads — with zeroed
    // aggregates. Anonymized contacts are never listed.
    const base =
      filter.includeLeads && !filter.eventId
        ? customers
            .filter((c) => !c.anonymizedAt)
            .map((c) => {
              const agg = aggByEmail.get(c.email);
              return {
                email: c.email,
                name: c.name,
                phone: c.phone,
                optedOut: c.optedOut,
                orderCount: agg?.orderCount ?? 0,
                totalSpentCents: agg?.totalCents ?? 0,
                lastPurchaseAt: c.lastPurchaseAt,
              };
            })
        : aggregates.map((agg) => {
            const customer = byEmail.get(agg.buyerEmail);
            return {
              email: agg.buyerEmail,
              name: customer?.name ?? null,
              phone: customer?.phone ?? null,
              optedOut: customer?.optedOut ?? false,
              orderCount: agg.orderCount,
              totalSpentCents: agg.totalCents,
              lastPurchaseAt: customer?.lastPurchaseAt ?? null,
            };
          });

    const rows = base
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
