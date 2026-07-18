/**
 * Password hashing port. The concrete adapter uses Argon2id
 * (packages/adapters) — never hand-rolled hashing, never plaintext
 * (FR-AUTH-002, CLAUDE_SECURITY_RULES §5).
 */
export interface PasswordHasherPort {
  hash(plaintext: string): Promise<string>;
  verify(hash: string, plaintext: string): Promise<boolean>;
}
