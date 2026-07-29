import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptWithKey, encryptWithKey } from "../encryption";

const KEY = randomBytes(32).toString("hex");
const OTHER_KEY = randomBytes(32).toString("hex");
const URL = "postgresql://app_runtime:s3cr3t@ep-example.neon.tech/tenantdb?sslmode=require";

describe("platform encryption (AES-256-GCM)", () => {
  it("round-trips a connection string", () => {
    const encrypted = encryptWithKey(URL, KEY);
    expect(encrypted).not.toContain("s3cr3t");
    expect(decryptWithKey(encrypted, KEY)).toBe(URL);
  });

  it("produces a fresh IV per call (no deterministic ciphertext)", () => {
    expect(encryptWithKey(URL, KEY)).not.toBe(encryptWithKey(URL, KEY));
  });

  it("rejects the wrong key without leaking details", () => {
    const encrypted = encryptWithKey(URL, KEY);
    expect(() => decryptWithKey(encrypted, OTHER_KEY)).toThrow("Invalid encrypted payload");
  });

  it("rejects a tampered payload (GCM auth)", () => {
    const raw = Buffer.from(encryptWithKey(URL, KEY), "base64");
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 0xff;
    expect(() => decryptWithKey(raw.toString("base64"), KEY)).toThrow(
      "Invalid encrypted payload",
    );
  });

  it("rejects malformed keys and truncated payloads", () => {
    expect(() => encryptWithKey(URL, "not-hex")).toThrow("Invalid platform encryption key");
    expect(() => decryptWithKey("AAAA", KEY)).toThrow("Invalid encrypted payload");
  });
});
