import type { MembershipRole } from "../identity/types";

/**
 * PRD §8.2 / FR-ADM-003/004, FR-TKT-009/012 — support operations on individual
 * tickets (block, transfer, correct data). Owner/Admin are superusers; Support
 * is the operational role.
 */
export const TICKET_SUPPORT_ROLES: readonly MembershipRole[] = ["OWNER", "ADMIN", "SUPPORT"];

// PRD §11.4 — transfer regenerates the token and returns to VALID,
// so "transferred" is not a resting state.
export type TicketStatus =
  | "PENDING_ISSUE"
  | "VALID"
  | "CHECKED_IN"
  | "BLOCKED"
  | "CANCELLED"
  | "REFUNDED";

export interface TicketRecord {
  id: string;
  organizationId: string;
  eventId: string;
  orderId: string;
  orderItemId: string;
  ticketTypeId: string;
  status: TicketStatus;
  tokenHash: string;
  participantName: string | null;
  participantEmail: string | null;
  issuedAt: Date;
}

/** Issued ticket with its raw token — exists ONLY in memory at issue time. */
export interface IssuedTicket {
  ticket: TicketRecord;
  rawToken: string;
}
