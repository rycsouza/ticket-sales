export type TicketTypeKind = "FULL" | "HALF" | "PROMOTIONAL" | "COURTESY" | "CUSTOM";

export type SalesBatchStatus = "SCHEDULED" | "OPEN" | "CLOSED" | "SOLD_OUT";

export interface TicketTypeRecord {
  id: string;
  organizationId: string;
  eventId: string;
  sectorId: string | null;
  kind: TicketTypeKind;
  active: boolean;
  name: string;
}

export interface SalesBatchRecord {
  id: string;
  organizationId: string;
  eventId: string;
  ticketTypeId: string;
  status: SalesBatchStatus;
  name: string;
  priceCents: number;
  quantityTotal: number;
  quantitySold: number;
  quantityReserved: number;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
  maxPerOrder: number | null;
}

/** Committed units of a batch = sold + reserved (BR-INV-001). */
export function committedOf(batch: SalesBatchRecord): number {
  return batch.quantitySold + batch.quantityReserved;
}
