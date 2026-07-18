import { z } from "zod";
import { MEMBERSHIP_ROLES } from "./types";

// All input schemas are strict allowlists (CLAUDE_SECURITY_RULES §8/§9):
// unknown fields are rejected, sensitive fields (ids, roles beyond the
// explicit ones, status) are never accepted from the client.

const nameSchema = z.string().trim().min(2).max(120);
const emailSchema = z.string().trim().toLowerCase().email().max(254);

// Invitable roles: OWNER is excluded on purpose — ownership is granted at
// organization creation or via a dedicated transfer flow, never by invite.
const invitableRoleSchema = z.enum(
  MEMBERSHIP_ROLES.filter((role) => role !== "OWNER") as [string, ...string[]],
);

export const createOrganizationSchema = z
  .object({
    name: nameSchema,
    document: z
      .string()
      .trim()
      .regex(/^\d{11}$|^\d{14}$/, "document must be CPF (11) or CNPJ (14) digits")
      .optional(),
    email: emailSchema.optional(),
    phone: z.string().trim().min(8).max(20).optional(),
  })
  .strict();

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const inviteUserSchema = z
  .object({
    email: emailSchema,
    role: invitableRoleSchema,
  })
  .strict();

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

// Password policy (FR-AUTH-002): minimum length per current OWASP/NIST
// guidance; no forced composition rules; max bounds the hashing cost.
export const passwordSchema = z.string().min(10).max(128);

export const acceptInviteSchema = z
  .object({
    token: z.string().min(20).max(200),
    name: nameSchema,
    password: passwordSchema,
  })
  .strict();

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
