import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated symmetric encryption (AES-256-GCM) for secrets at rest — used
 * for the TOTP shared secret, which must be recoverable (so it can't be hashed)
 * but must never sit in the database as plaintext. The 32-byte key comes from
 * env (MFA_ENCRYPTION_KEY, hex or base64); it is NEVER stored with the data.
 * Format: base64(iv).base64(authTag).base64(ciphertext).
 */
export function loadKey(raw: string): Buffer {
  const key = raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("MFA_ENCRYPTION_KEY must be 32 bytes (64 hex or base64 chars)");
  }
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
