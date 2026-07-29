import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/**
 * Server-side environment variables.
 *
 * Validated once at boot (NFR: fail fast on misconfiguration). Secrets live in
 * Vercel env vars / local .env — never in the repository (NFR-SEC-004).
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Legacy single-DB URLs (docs/MULTITENANT.md §9). Since MT-5 the app runtime
  // NEVER uses these — tenants resolve via the platform registry (fail-closed).
  // Kept for tooling only: prisma CLI, ops scripts and integration tests.
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),

  // Multi-tenant control plane (docs/MULTITENANT.md). Optional while the
  // migration is staged; required in production from MT-5 on.
  PLATFORM_DATABASE_URL: z.string().url().optional(),
  PLATFORM_DIRECT_URL: z.string().url().optional(),
  // AES-256-GCM key (32 bytes / 64 hex) that encrypts tenant connection
  // strings at rest. Generate with: openssl rand -hex 32
  ENCRYPTION_KEY_PLATFORM_DB: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "must be 64 hex chars (32 bytes)")
    .optional(),

  // Upstash
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  QSTASH_TOKEN: z.string().min(1).optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),

  // PSP — provider selected by configuration (ARQUITETURA §10)
  PSP_PROVIDER: z.enum(["mercadopago"]).default("mercadopago"),
  MERCADOPAGO_ACCESS_TOKEN: z.string().min(1).optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Public (client-side) key for the card tokenization SDK/Brick. NOT a secret:
  // it only tokenizes card data in the browser (card PAN never reaches us).
  MERCADOPAGO_PUBLIC_KEY: z.string().min(1).optional(),

  // DEC-012 — 32-byte key (64 hex or base64) for the TOTP secret box. When set,
  // MFA is ENFORCED for every panel login; absent (dev), MFA is skipped.
  MFA_ENCRYPTION_KEY: z.string().min(1).optional(),

  // Mailtrap (Sending API in production; sandbox in dev/staging)
  MAILTRAP_API_TOKEN: z.string().min(1).optional(),
  MAILTRAP_SENDER_EMAIL: z.string().email().optional(),

  // When "true" AND a mailer is configured, panel logins on untrusted devices
  // require a one-time code sent by e-mail (takes precedence over TOTP).
  EMAIL_2FA_ENABLED: z.enum(["true", "false"]).default("false"),

  // Google OAuth (optional) — social login is enabled only when both are set.
  // Redirect URI is derived from APP_BASE_URL: <base>/api/auth/google/callback.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  // Cloudinary — PUBLIC event images only (never private data)
  CLOUDINARY_URL: z.string().min(1).optional(),

  // Cloudflare R2 — private files (exports, offline packages), signed URLs
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),

  // Observability
  SENTRY_DSN: z.string().url().optional(),

  // Public base URL for buyer-facing links (ticket pages, e-mails)
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  // DEC-003 — comma-separated allowlist of e-mails that may access the
  // platform-admin surface (fee configuration, external payouts). There is no
  // platform-admin ROLE; this env allowlist is the gate. Absent → no admins.
  PLATFORM_ADMIN_EMAILS: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parse and cache env. Throws with a readable message when invalid. */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached) return cached;
  if (source === process.env && !source.PLATFORM_DATABASE_URL) {
    // Monorepo dev: Next only auto-loads app-local .env files, while secrets
    // live in the repo-root .env (gitignored). Harmless no-op when the file
    // does not exist (e.g. on Vercel, where env comes from the platform).
    loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
  }
  // Empty strings mean "not configured yet" (e.g. placeholder lines in .env)
  // and must behave exactly like an absent variable.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ""),
  );
  const parsed = serverEnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    // Never echo actual values — only variable names and the validation issue.
    throw new Error(`Invalid server environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: clear the cached env between test cases. */
export function resetServerEnvCache(): void {
  cached = undefined;
}
