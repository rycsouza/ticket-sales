import { describe, expect, it } from "vitest";
import { brandTokens } from "../brand-theme";

describe("brandTokens", () => {
  it("returns {} for invalid input — bad DB values never inject CSS", () => {
    expect(brandTokens(null)).toEqual({});
    expect(brandTokens(undefined)).toEqual({});
    expect(brandTokens("")).toEqual({});
    expect(brandTokens("red")).toEqual({});
    expect(brandTokens("#fff")).toEqual({});
    expect(brandTokens("#16a34azz")).toEqual({});
    expect(brandTokens("#16a34a; background: url(x)")).toEqual({});
  });

  it("derives all six brand tokens from one hex", () => {
    const tokens = brandTokens("#2563eb");
    expect(tokens["--color-brand"]).toBe("#2563eb");
    expect(Object.keys(tokens)).toHaveLength(6);
    for (const value of Object.values(tokens)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("hover/active darken and soft/border lighten the base", () => {
    const tokens = brandTokens("#16a34a");
    const channel = (hex: string) => parseInt(hex.slice(1, 3), 16);
    const base = channel("#16a34a");
    expect(channel(tokens["--color-brand-hover"]!)).toBeLessThan(base);
    expect(channel(tokens["--color-brand-active"]!)).toBeLessThan(
      channel(tokens["--color-brand-hover"]!),
    );
    expect(channel(tokens["--color-brand-soft"]!)).toBeGreaterThan(base);
    expect(channel(tokens["--color-brand-border"]!)).toBeGreaterThan(base);
  });

  it("picks white foreground on dark brands and ink on light brands", () => {
    expect(brandTokens("#2563eb")["--color-brand-fg"]).toBe("#ffffff");
    expect(brandTokens("#111827")["--color-brand-fg"]).toBe("#ffffff");
    expect(brandTokens("#facc15")["--color-brand-fg"]).toBe("#111827"); // amarelo claro
    expect(brandTokens("#f9fafb")["--color-brand-fg"]).toBe("#111827");
  });
});
