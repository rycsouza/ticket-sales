import type { MembershipRole } from "../identity/types";

export type LedgerAccount = "PRODUCER" | "PLATFORM" | "PROMOTER";
export type LedgerEntryType =
  | "SALE"
  | "DISCOUNT"
  | "FEE"
  | "PSP_COST"
  | "COMMISSION"
  | "REFUND"
  | "PAYOUT"
  | "ADJUSTMENT";

/** FR-FIN-010 — financial data is restricted to owner/admin/finance. */
export const FINANCE_ROLES: readonly MembershipRole[] = ["OWNER", "ADMIN", "FINANCE"];

export interface LedgerEntryRecord {
  id: string;
  organizationId: string;
  eventId: string;
  orderId: string | null;
  account: LedgerAccount;
  type: LedgerEntryType;
  amountCents: number;
  membershipId: string | null;
  memo: string | null;
  createdAt: Date;
}

/**
 * Event financial summary, reproducible from the ledger (NFR-REL-006). All
 * values in integer cents. `producerPayableCents` is the estimated payout base
 * (BR-FIN-003 estimated ≠ settled — settlement is manual in the MVP).
 */
export interface EventFinancialSummary {
  eventId: string;
  grossSalesCents: number; // SALE
  discountCents: number; // DISCOUNT (as a positive magnitude)
  platformFeeCents: number; // FEE (platform revenue)
  pspCostCents: number; // PSP_COST (as a positive magnitude)
  commissionCents: number; // COMMISSION owed to promoters
  refundedCents: number; // gross magnitude reversed
  producerPayableCents: number; // PRODUCER account balance
  platformNetCents: number; // PLATFORM account balance (fee − psp cost)
  promoterPayableCents: number; // PROMOTER account balance
  payoutsCents: number; // PAYOUT already registered against producer
}
