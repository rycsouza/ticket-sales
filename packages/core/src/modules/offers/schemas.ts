import { z } from "zod";

/** Product CRUD (org-level). Money is integer cents; never a float. */
export const createProductSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional(),
    priceCents: z.number().int().min(0).max(100_000_000),
  })
  .strict();
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    priceCents: z.number().int().min(0).max(100_000_000).optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/**
 * Offer CRUD (org-level). Exactly one target (batchId | productId) is required;
 * the cross-field rule is enforced by the service too. `eventId` null = every
 * event, allowed only for product-target offers.
 */
export const createOfferSchema = z
  .object({
    kind: z.enum(["ORDER_BUMP", "UPSELL"]),
    eventId: z.string().uuid().nullable().optional(),
    batchId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    title: z.string().trim().max(120).optional(),
    description: z.string().trim().max(500).optional(),
    priceCentsOverride: z.number().int().min(0).max(100_000_000).optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .strict()
  .refine((o) => (o.batchId ? 1 : 0) + (o.productId ? 1 : 0) === 1, {
    message: "Informe exatamente um alvo: um lote de ingresso OU um produto.",
  });
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const updateOfferSchema = z
  .object({
    title: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    priceCentsOverride: z.number().int().min(0).max(100_000_000).nullable().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
