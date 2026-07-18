import { z } from "zod";

/**
 * Segment filter (FR-CRM-003) — strict allowlist. Opted-out customers are
 * excluded unless explicitly included (they still count as customers but must
 * not be targeted for marketing — FR-CRM-008).
 */
export const segmentFilterSchema = z
  .object({
    eventId: z.string().uuid().optional(),
    minOrders: z.number().int().min(1).max(1000).optional(),
    minSpentCents: z.number().int().min(0).max(1_000_000_000).optional(),
    includeOptedOut: z.boolean().optional(),
  })
  .strict();
export type SegmentFilterInput = z.infer<typeof segmentFilterSchema>;

// FR/LGPD — erasure request for one customer.
export const anonymizeCustomerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
  })
  .strict();
export type AnonymizeCustomerInput = z.infer<typeof anonymizeCustomerSchema>;

// Public checkout — look up an existing customer by phone (masked result only).
export const customerLookupSchema = z
  .object({
    phone: z.string().trim().min(8).max(20),
  })
  .strict();
export type CustomerLookupInput = z.infer<typeof customerLookupSchema>;

export const setOptOutSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    optedOut: z.boolean(),
  })
  .strict();
export type SetOptOutInput = z.infer<typeof setOptOutSchema>;
