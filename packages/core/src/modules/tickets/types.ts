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
