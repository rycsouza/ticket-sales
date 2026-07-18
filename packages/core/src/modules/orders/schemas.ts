import { z } from "zod";

/**
 * Public checkout input (FR-CHK-006/007). Strict allowlist: prices, totals,
 * discounts and statuses NEVER come from the client — everything monetary is
 * recomputed server-side from the batch rows (CLAUDE_SECURITY_RULES §19).
 */
export const createOrderSchema = z
  .object({
    eventId: z.string().uuid(),
    items: z
      .array(
        z
          .object({
            batchId: z.string().uuid(),
            quantity: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(5)
      .refine(
        (items) => new Set(items.map((item) => item.batchId)).size === items.length,
        { message: "Duplicate batchId entries — merge quantities per batch" },
      ),
    buyer: z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().toLowerCase().email().max(254),
        document: z
          .string()
          .trim()
          .regex(/^\d{11}$|^\d{14}$/, "document must be CPF (11) or CNPJ (14) digits")
          .optional(),
        phone: z.string().trim().min(8).max(20).optional(),
      })
      .strict(),
  })
  .strict();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderLookupSchema = z
  .object({
    code: z.string().trim().min(8).max(40),
    email: z.string().trim().toLowerCase().email().max(254),
  })
  .strict();

export type OrderLookupInput = z.infer<typeof orderLookupSchema>;
