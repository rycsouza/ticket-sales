import { InvalidTransitionError } from "../../shared/errors";
import type { TicketStatus } from "./types";

/**
 * Ticket state machine (PRD §11.4). Transfer is NOT a state change — it stays
 * VALID and rotates the token — so it is validated separately (only from VALID).
 *
 *   PENDING_ISSUE → VALID
 *   VALID         → BLOCKED | CHECKED_IN | CANCELLED | REFUNDED
 *   BLOCKED       → VALID | CANCELLED | REFUNDED
 *   CHECKED_IN    → VALID            (authorized reversal only — Fase 6)
 *   CANCELLED / REFUNDED             (terminal)
 *
 * BLOCKED → CANCELLED/REFUNDED collapses "unblock then settle": a refund must
 * not require unblocking first.
 */
const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  PENDING_ISSUE: ["VALID"],
  VALID: ["BLOCKED", "CHECKED_IN", "CANCELLED", "REFUNDED"],
  BLOCKED: ["VALID", "CANCELLED", "REFUNDED"],
  CHECKED_IN: ["VALID"],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

export function assertTicketTransition(from: TicketStatus, to: TicketStatus): void {
  if (!canTransitionTicket(from, to)) {
    throw new InvalidTransitionError("ticket", from, to);
  }
}
