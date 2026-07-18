import { InvalidTransitionError } from "../../shared/errors";
import type { SalesBatchStatus } from "./types";

/**
 * Batch lifecycle. SOLD_OUT is set automatically when the last unit is
 * committed (Fase 2 checkout); OPEN from SOLD_OUT/CLOSED covers manual
 * reopening after a quantity increase or an operational decision
 * (FR-INV-011 covers manual close).
 */
export const BATCH_TRANSITIONS: Readonly<Record<SalesBatchStatus, readonly SalesBatchStatus[]>> = {
  SCHEDULED: ["OPEN", "CLOSED"],
  OPEN: ["CLOSED", "SOLD_OUT"],
  CLOSED: ["OPEN"],
  SOLD_OUT: ["OPEN"],
};

export function assertBatchTransition(from: SalesBatchStatus, to: SalesBatchStatus): void {
  if (!BATCH_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError("sales_batch", from, to);
  }
}
