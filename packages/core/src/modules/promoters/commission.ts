import { cents, percentageOf, type Cents } from "../../shared/money";
import type {
  CommissionBase,
  CommissionRuleRecord,
  CommissionRuleSnapshot,
} from "./types";

/** A paid unit eligible for commission. */
export interface EligibleUnit {
  ticketTypeId: string;
  unitPriceCents: number;
}

export interface CommissionComputation {
  quantity: number;
  /** Total eligible base the commission was computed from. */
  baseCents: number;
  /** Total commission owed to the promoter (>= 0). */
  amountCents: number;
  /** Distinct rules applied, snapshotted for reproducibility. */
  rules: CommissionRuleSnapshot[];
}

/**
 * Picks the most specific ACTIVE rule for a unit (FR-PRM-009). Specificity:
 * membership+ticketType > membership > ticketType > event-wide. A rule is a
 * candidate only when its narrowing fields either match or are unset.
 */
export function resolveRuleForUnit(
  rules: CommissionRuleRecord[],
  promoterMembershipId: string,
  ticketTypeId: string,
): CommissionRuleRecord | null {
  let best: CommissionRuleRecord | null = null;
  let bestScore = -1;
  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.membershipId !== null && rule.membershipId !== promoterMembershipId) continue;
    if (rule.ticketTypeId !== null && rule.ticketTypeId !== ticketTypeId) continue;
    const score = (rule.membershipId !== null ? 2 : 0) + (rule.ticketTypeId !== null ? 1 : 0);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Per-unit base amount. AFTER_DISCOUNT applies the unit's proportional share
 * of the whole-order discount (BR-PRM-005). Integer-only, half-up rounding via
 * percentageOf so ledger entries are reproducible (NFR-REL-006).
 */
function unitBase(
  unitPriceCents: number,
  base: CommissionBase,
  subtotalCents: number,
  discountCents: number,
): Cents {
  const gross = cents(unitPriceCents);
  if (base === "NOMINAL" || discountCents <= 0 || subtotalCents <= 0) return gross;
  // Discount share as basis points of the subtotal, applied to this unit.
  const discountBps = Math.round((discountCents / subtotalCents) * 10_000);
  const share = percentageOf(gross, Math.min(discountBps, 10_000));
  const net = unitPriceCents - share;
  return cents(net < 0 ? 0 : net);
}

/**
 * Commission for a set of eligible units attributed to one promoter. Each unit
 * resolves its own rule; results aggregate into one movement. Units without a
 * matching rule contribute zero (no rule = no commission).
 */
export function computeCommission(
  units: EligibleUnit[],
  rules: CommissionRuleRecord[],
  promoterMembershipId: string,
  order: { subtotalCents: number; discountCents: number },
): CommissionComputation {
  let quantity = 0;
  let baseTotal = 0;
  let amountTotal = 0;
  const usedRules = new Map<string, CommissionRuleSnapshot>();

  for (const unit of units) {
    const rule = resolveRuleForUnit(rules, promoterMembershipId, unit.ticketTypeId);
    if (!rule) continue;

    const base = unitBase(
      unit.unitPriceCents,
      rule.base,
      order.subtotalCents,
      order.discountCents,
    );
    const amount =
      rule.type === "PERCENT" ? percentageOf(base, rule.value) : cents(rule.value);

    quantity += 1;
    baseTotal += base;
    amountTotal += amount;
    if (!usedRules.has(rule.id)) {
      usedRules.set(rule.id, {
        ruleId: rule.id,
        type: rule.type,
        value: rule.value,
        base: rule.base,
      });
    }
  }

  return {
    quantity,
    baseCents: baseTotal,
    amountCents: amountTotal,
    rules: [...usedRules.values()],
  };
}
