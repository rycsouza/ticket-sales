import { InvalidTransitionError } from "../../shared/errors";
import type { EventStatus } from "./types";

/**
 * Event state machine (PRD §11.1). CANCELLED and ARCHIVED are terminal for
 * sales; reactivating a cancelled event requires a NEW event, never a
 * transition (PRD §11.1 rules). Invalid transitions throw — they are never
 * silently corrected (AGENTS.md).
 */
export const EVENT_TRANSITIONS: Readonly<Record<EventStatus, readonly EventStatus[]>> = {
  DRAFT: ["PUBLISHED", "CANCELLED", "ARCHIVED"],
  PUBLISHED: ["SALES_PAUSED", "SALES_CLOSED", "POSTPONED", "CANCELLED"],
  SALES_PAUSED: ["PUBLISHED", "SALES_CLOSED", "POSTPONED", "CANCELLED"],
  SALES_CLOSED: ["COMPLETED", "POSTPONED", "CANCELLED"],
  POSTPONED: ["PUBLISHED", "CANCELLED"],
  COMPLETED: ["ARCHIVED"],
  CANCELLED: [],
  ARCHIVED: [],
};

export function assertEventTransition(from: EventStatus, to: EventStatus): void {
  if (!EVENT_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError("event", from, to);
  }
}
