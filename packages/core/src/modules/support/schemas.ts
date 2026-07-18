import { z } from "zod";

const ORDER_STATUS = [
  "CREATED",
  "AWAITING_PAYMENT",
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "EXPIRED",
  "CANCELLED",
  "CHARGEBACK",
] as const;

/**
 * FR-ADM-001 — order search filters for the support console. All fields are
 * optional; an empty query returns the most recent orders (bounded by `limit`).
 * `q`, `status` and `eventId` are the only client-supplied dimensions — never a
 * raw where clause.
 */
export const searchOrdersSchema = z
  .object({
    q: z.string().trim().min(1).max(120).optional(),
    status: z.enum(ORDER_STATUS).optional(),
    eventId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type SearchOrdersInput = z.infer<typeof searchOrdersSchema>;

/** FR-ADM-009 — internal note body. Never shown to the buyer. */
export const addOrderNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
  })
  .strict();
export type AddOrderNoteInput = z.infer<typeof addOrderNoteSchema>;
