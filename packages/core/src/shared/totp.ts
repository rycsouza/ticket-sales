import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) over HMAC-SHA1, 6 digits, 30s step — the de-facto standard
 * that Google Authenticator / Authy / 1Password implement. Verification allows
 * ±1 step for clock skew. No external dependency.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // RFC 4648 base32

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAuthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function hotp(secretBytes: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // Counter as 64-bit big-endian (high 32 bits are 0 for our time range).
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", secretBytes).update(buf).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/** Current TOTP code for a secret at `now` (used by clients/tests). */
export function generateTotp(secret: string, now: Date): string {
  const counter = Math.floor(now.getTime() / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secret), counter);
}

/** Verifies a code against the secret at `now`, tolerating ±1 time step. */
export function verifyTotp(secret: string, code: string, now: Date, window = 1): boolean {
  const cleaned = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const secretBytes = base32Decode(secret);
  if (secretBytes.length === 0) return false;
  const counter = Math.floor(now.getTime() / 1000 / STEP_SECONDS);
  for (let offset = -window; offset <= window; offset++) {
    const expected = hotp(secretBytes, counter + offset);
    // Constant-time compare of the two 6-digit strings.
    const a = Buffer.from(expected);
    const b = Buffer.from(cleaned);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

// --- base32 (RFC 4648, no padding) -----------------------------------------

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) return Buffer.alloc(0);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
