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
    // name/email are optional ONLY to support reuse of an existing customer by
    // phone (resolved server-side). The refine guarantees we always end up with
    // a contact: full data, or a phone to resolve it from.
    buyer: z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        email: z.string().trim().toLowerCase().email().max(254).optional(),
        document: z
          .string()
          .trim()
          .regex(/^\d{11}$|^\d{14}$/, "document must be CPF (11) or CNPJ (14) digits")
          .optional(),
        phone: z.string().trim().min(8).max(20).optional(),
      })
      .strict()
      .refine((b) => (!!b.name && !!b.email) || !!b.phone, {
        message: "Informe nome e e-mail, ou o telefone de um cadastro existente.",
      }),
    // Attribution (FR-CHK-008/009/010) — opaque strings, length-capped. The
    // discount and promoter credit are resolved SERVER-SIDE from these refs.
    coupon: z.string().trim().min(1).max(40).optional(),
    ref: z.string().trim().min(1).max(64).optional(),
    utm: z
      .object({
        source: z.string().trim().max(120).optional(),
        medium: z.string().trim().max(120).optional(),
        campaign: z.string().trim().max(120).optional(),
        content: z.string().trim().max(120).optional(),
        term: z.string().trim().max(120).optional(),
      })
      .strict()
      .optional(),
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
