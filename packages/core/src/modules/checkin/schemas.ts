import { z } from "zod";

export const assignOperatorSchema = z
  .object({
    membershipId: z.string().uuid(),
    sectorId: z.string().uuid().optional(),
  })
  .strict();
export type AssignOperatorInput = z.infer<typeof assignOperatorSchema>;

// FR-CIN-003 — validate a scanned QR (raw token) at the gate.
export const validateTicketSchema = z
  .object({
    token: z.string().trim().min(10).max(200),
    deviceId: z.string().trim().max(64).optional(),
  })
  .strict();
export type ValidateTicketInput = z.infer<typeof validateTicketSchema>;

// FR-CIN-009 — exceptional manual admission requires a justification.
export const manualCheckinSchema = z
  .object({
    ticketId: z.string().uuid(),
    justification: z.string().trim().min(5).max(500),
    deviceId: z.string().trim().max(64).optional(),
  })
  .strict();
export type ManualCheckinInput = z.infer<typeof manualCheckinSchema>;

export const undoCheckinSchema = z
  .object({
    ticketId: z.string().uuid(),
    justification: z.string().trim().min(5).max(500),
  })
  .strict();
export type UndoCheckinInput = z.infer<typeof undoCheckinSchema>;

// FR-CIN-011/016 — offline batch sync. Each item is one admission the device
// recorded while offline. Idempotent + conflict-detecting on the server.
export const syncBatchSchema = z
  .object({
    deviceId: z.string().trim().min(1).max(64),
    items: z
      .array(
        z
          .object({
            token: z.string().trim().min(10).max(200),
            checkedInAt: z.coerce.date(),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict();
export type SyncBatchInput = z.infer<typeof syncBatchSchema>;
