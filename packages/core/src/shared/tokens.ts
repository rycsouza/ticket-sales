import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque secret tokens (sessions, invites, magic links).
 *
 * - Generated with CSPRNG, 256 bits of entropy, base64url encoded.
 * - Only the SHA-256 hash is persisted; the raw token exists solely in the
 *   cookie/e-mail (CLAUDE_SECURITY_RULES §13 — never store or log raw tokens).
 * - SHA-256 (not Argon2) is appropriate here: tokens are high-entropy random
 *   values, not human passwords, so brute-force resistance comes from entropy.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Constant-time comparison of two token hashes. */
export function tokenHashEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
