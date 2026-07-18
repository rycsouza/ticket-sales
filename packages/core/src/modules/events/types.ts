import type { MembershipRole } from "../identity/types";

// PRD §11.1
export type EventStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "SALES_PAUSED"
  | "SALES_CLOSED"
  | "POSTPONED"
  | "CANCELLED"
  | "COMPLETED"
  | "ARCHIVED";

/** PRD §8.2 — "Criar evento": Proprietário e Gestor. */
export const EVENT_MANAGER_ROLES: readonly MembershipRole[] = [
  "OWNER",
  "ADMIN",
  "EVENT_MANAGER",
];

export interface EventRecord {
  id: string;
  organizationId: string;
  status: EventStatus;
  title: string;
  slug: string;
  description: string | null;
  venueName: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  timezone: string;
  startsAt: Date | null;
  endsAt: Date | null;
  capacityTotal: number | null;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
  ageRating: string | null;
  cancellationPolicy: string | null;
  eventTerms: string | null;
  maxTicketsPerOrder: number | null;
  publishedAt: Date | null;
}

export interface SectorRecord {
  id: string;
  organizationId: string;
  eventId: string;
  name: string;
  capacity: number | null;
}

/** States in which the event data can no longer be edited. */
export const EVENT_TERMINAL_STATES: readonly EventStatus[] = [
  "CANCELLED",
  "COMPLETED",
  "ARCHIVED",
];
