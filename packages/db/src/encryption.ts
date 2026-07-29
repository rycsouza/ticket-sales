import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for tenant connection strings at rest (docs/MULTITENANT.md §4).
 *
 * Wire format — IDENTICAL to the Sport55 platform so ops tooling is reusable:
 *   base64( iv[12] | authTag[16] | ciphertext )
 *
 * The key is ENCRYPTION_KEY_PLATFORM_DB: 32 bytes as 64 hex chars. Key and
 * plaintext must never appear in logs or error messages — errors here are
 * deliberately generic.
 */

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function parseKey(keyHex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    // Generic on purpose: never echo key material or its shape beyond this.
    throw new Error("Invalid platform encryption key");
  }
  return Buffer.from(keyHex, "hex");
}

export function encryptWithKey(plaintext: string, keyHex: string): string {
  const key = parseKey(keyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptWithKey(payload: string, keyHex: string): string {
  const key = parseKey(keyHex);
  const raw = Buffer.from(payload, "base64");
  if (raw.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key or tampered payload — GCM auth failed. Never leak details.
    throw new Error("Invalid encrypted payload");
  }
}

export { KEY_LENGTH as PLATFORM_KEY_BYTES };
