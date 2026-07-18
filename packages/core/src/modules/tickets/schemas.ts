import { z } from "zod";

/** Support operations — strict allowlists (CLAUDE_SECURITY_RULES §19). */

// FR-TKT-009 — block/unblock demand a justification (audited).
export const blockTicketSchema = z
  .object({
    justification: z.string().trim().min(5).max(500),
  })
  .strict();
export type BlockTicketInput = z.infer<typeof blockTicketSchema>;

// FR-TKT-012 — non-financial participant data correction; at least one field.
export const correctParticipantSchema = z
  .object({
    participantName: z.string().trim().min(2).max(120).optional(),
    participantEmail: z.string().trim().toLowerCase().email().max(254).optional(),
  })
  .strict()
  .refine((v) => v.participantName !== undefined || v.participantEmail !== undefined, {
    message: "Provide at least one field to correct",
  });
export type CorrectParticipantInput = z.infer<typeof correctParticipantSchema>;

// FR-TKT-007 — transfer of ownership; a new holder identity is required.
export const transferTicketSchema = z
  .object({
    participantName: z.string().trim().min(2).max(120),
    participantEmail: z.string().trim().toLowerCase().email().max(254),
  })
  .strict();
export type TransferTicketInput = z.infer<typeof transferTicketSchema>;
