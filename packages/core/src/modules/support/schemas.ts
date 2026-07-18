import { z } from "zod";

/** FR-ADM-009 — internal note body. Never shown to the buyer. */
export const addOrderNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
  })
  .strict();
export type AddOrderNoteInput = z.infer<typeof addOrderNoteSchema>;
