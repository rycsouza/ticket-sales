import { z } from "zod";
import { passwordSchema } from "../identity/schemas";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

// DEC-012 — MFA challenge steps. The challenge token comes from a prior login.
const challengeToken = z.string().trim().min(20).max(200);

export const mfaSetupSchema = z.object({ challengeToken }).strict();
export type MfaSetupInput = z.infer<typeof mfaSetupSchema>;

export const mfaVerifySchema = z
  .object({
    challengeToken,
    // 6-digit TOTP or a backup code.
    code: z.string().trim().min(6).max(20),
    trustDevice: z.boolean().optional(),
  })
  .strict();
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
