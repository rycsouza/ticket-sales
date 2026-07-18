import { z } from "zod";

export const createTicketTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["FULL", "HALF", "PROMOTIONAL", "COURTESY", "CUSTOM"]),
    sectorId: z.string().uuid().optional(),
  })
  .strict();

export type CreateTicketTypeInput = z.infer<typeof createTicketTypeSchema>;

export const createSalesBatchSchema = z
  .object({
    ticketTypeId: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    // Money always in integer cents (BR-FIN-001). Zero is allowed: courtesy
    // and free batches exist; negative never.
    priceCents: z.number().int().min(0).max(100_000_000),
    quantityTotal: z.number().int().min(1).max(1_000_000),
    salesStartAt: z.coerce.date().optional(),
    salesEndAt: z.coerce.date().optional(),
    maxPerOrder: z.number().int().min(1).max(50).optional(),
  })
  .strict()
  .refine(
    (data) => !data.salesStartAt || !data.salesEndAt || data.salesEndAt > data.salesStartAt,
    { message: "salesEndAt must be after salesStartAt" },
  );

export type CreateSalesBatchInput = z.infer<typeof createSalesBatchSchema>;

export const updateBatchQuantitySchema = z
  .object({
    quantityTotal: z.number().int().min(1).max(1_000_000),
    justification: z.string().trim().min(5).max(500).optional(),
  })
  .strict();

export type UpdateBatchQuantityInput = z.infer<typeof updateBatchQuantitySchema>;
