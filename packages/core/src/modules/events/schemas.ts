import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase letters, digits and hyphens")
  .min(3)
  .max(80);

// Strict allowlists — status, organizationId, publishedAt etc. are NEVER
// accepted from the client (CLAUDE_SECURITY_RULES §8).
export const createEventSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    slug: slugSchema,
    description: z.string().trim().max(5000).optional(),
    venueName: z.string().trim().min(2).max(120).optional(),
    addressLine: z.string().trim().max(200).optional(),
    city: z.string().trim().min(2).max(80).optional(),
    state: z.string().trim().length(2).toUpperCase().optional(),
    timezone: z.string().trim().max(60).default("America/Sao_Paulo"),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    capacityTotal: z.number().int().positive().max(1_000_000).optional(),
    salesStartAt: z.coerce.date().optional(),
    salesEndAt: z.coerce.date().optional(),
    ageRating: z.string().trim().max(40).optional(),
    cancellationPolicy: z.string().trim().max(5000).optional(),
    eventTerms: z.string().trim().max(20000).optional(),
    maxTicketsPerOrder: z.number().int().min(1).max(50).optional(),
  })
  .strict()
  .refine((data) => !data.startsAt || !data.endsAt || data.endsAt > data.startsAt, {
    message: "endsAt must be after startsAt",
  })
  .refine(
    (data) => !data.salesStartAt || !data.salesEndAt || data.salesEndAt > data.salesStartAt,
    { message: "salesEndAt must be after salesStartAt" },
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;

// slug is immutable after creation (public URLs must not break silently).
// Capacity changes go through the dedicated changeEventCapacity use case
// so they are validated and audited (FR-EVT-010, BR-INV-004).
export const updateEventSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(5000).optional(),
    venueName: z.string().trim().min(2).max(120).optional(),
    addressLine: z.string().trim().max(200).optional(),
    city: z.string().trim().min(2).max(80).optional(),
    state: z.string().trim().length(2).toUpperCase().optional(),
    timezone: z.string().trim().max(60).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    salesStartAt: z.coerce.date().optional(),
    salesEndAt: z.coerce.date().optional(),
    ageRating: z.string().trim().max(40).optional(),
    cancellationPolicy: z.string().trim().max(5000).optional(),
    eventTerms: z.string().trim().max(20000).optional(),
    maxTicketsPerOrder: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const createSectorSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    capacity: z.number().int().positive().max(1_000_000).optional(),
  })
  .strict();

export type CreateSectorInput = z.infer<typeof createSectorSchema>;
