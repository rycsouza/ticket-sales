import { hash, verify } from "@node-rs/argon2";
import type { PasswordHasherPort } from "@ingressos/core/ports";

/**
 * Argon2id adapter (FR-AUTH-002, NFR-SEC-005). Parameters follow current
 * OWASP recommendations (m=19 MiB, t=2, p=1) and are versioned inside the
 * hash string, so they can be raised later without breaking verification.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2PasswordHasher implements PasswordHasherPort {
  async hash(plaintext: string): Promise<string> {
    return hash(plaintext, ARGON2_OPTIONS);
  }

  async verify(hashed: string, plaintext: string): Promise<boolean> {
    try {
      return await verify(hashed, plaintext);
    } catch {
      // Malformed hash (e.g. dummy timing hash) — treat as non-match.
      return false;
    }
  }
}
