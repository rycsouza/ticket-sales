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
