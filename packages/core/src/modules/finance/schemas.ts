import { z } from "zod";

/** FR-FIN-013 — register an externally-executed payout (manual in the MVP). */
export const registerPayoutSchema = z
  .object({
    amountCents: z.number().int().min(1).max(1_000_000_000),
    memo: z.string().trim().min(3).max(500),
  })
  .strict();
export type RegisterPayoutInput = z.infer<typeof registerPayoutSchema>;
