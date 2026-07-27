import type { MembershipRole } from "../identity/types";

export type OfferKind = "ORDER_BUMP" | "UPSELL";

/** Managing products & offers: owner + managers (mirrors promoters). */
export const OFFER_MANAGER_ROLES: readonly MembershipRole[] = ["OWNER", "ADMIN", "EVENT_MANAGER"];

/** A standalone paid add-on (no ticket, no check-in), org-scoped. */
export interface ProductRecord {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  priceCents: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A promoted checkout offer. Targets EITHER an existing ticket lote (batchId)
 * or a standalone Product (productId) — exactly one is set.
 */
export interface OfferRecord {
  id: string;
  organizationId: string;
  eventId: string | null;
  kind: OfferKind;
  batchId: string | null;
  productId: string | null;
  title: string | null;
  description: string | null;
  priceCentsOverride: number | null;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * An offer resolved for buyer display: the pitch and the effective price,
 * computed server-side. `available` is false when the target is inactive/closed
 * (still listed so the UI can hide or disable it consistently).
 */
export interface CheckoutOfferView {
  id: string;
  kind: OfferKind;
  title: string;
  description: string | null;
  priceCents: number;
  /** Only for ticket-target offers — lets the UI show the original price. */
  originalPriceCents: number | null;
  /**
   * True when the offer's target is a ticket lote (so it counts toward the
   * platform-fee base, exactly like a regular ticket). False for standalone
   * products (pass-through, no fee). Lets the client mirror the server total.
   */
  isTicket: boolean;
}
