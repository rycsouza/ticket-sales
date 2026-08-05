import { describe, expect, it } from "vitest";
import { brandTokens, storefrontAccentTokens } from "../brand-theme";

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

  it("derives the four brand tokens from one hex (soft/border stay with the stylesheet)", () => {
    const tokens = brandTokens("#2563eb");
    expect(tokens["--color-brand"]).toBe("#2563eb");
    expect(Object.keys(tokens)).toHaveLength(4);
    // soft/border are theme-dependent (globals.css color-mix) — emitting them
    // inline would override the dark theme. Never emit them here.
    expect(tokens).not.toHaveProperty("--color-brand-soft");
    expect(tokens).not.toHaveProperty("--color-brand-border");
    for (const value of Object.values(tokens)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("hover/active darken the base", () => {
    const tokens = brandTokens("#16a34a");
    const channel = (hex: string) => parseInt(hex.slice(1, 3), 16);
    const base = channel("#16a34a");
    expect(channel(tokens["--color-brand-hover"]!)).toBeLessThan(base);
    expect(channel(tokens["--color-brand-active"]!)).toBeLessThan(
      channel(tokens["--color-brand-hover"]!),
    );
  });

  it("picks white foreground on dark brands and ink on light brands", () => {
    expect(brandTokens("#2563eb")["--color-brand-fg"]).toBe("#ffffff");
    expect(brandTokens("#111827")["--color-brand-fg"]).toBe("#ffffff");
    expect(brandTokens("#facc15")["--color-brand-fg"]).toBe("#111827"); // amarelo claro
    expect(brandTokens("#f9fafb")["--color-brand-fg"]).toBe("#111827");
  });
});

describe("storefrontAccentTokens", () => {
  it("falls back to the default amber for absent/invalid input (never injects CSS)", () => {
    const fallback = storefrontAccentTokens(null);
    expect(fallback["--sf-accent"]).toBe("#f59e0b");
    expect(storefrontAccentTokens("red")).toEqual(fallback);
    expect(storefrontAccentTokens("#16a34a; url(x)")).toEqual(fallback);
  });

  it("derives all six tokens from the org color with safe formats", () => {
    const tokens = storefrontAccentTokens("#1e3a8a");
    expect(tokens["--sf-accent"]).toBe("#1e3a8a");
    expect(tokens["--sf-accent-fg"]).toBe("#ffffff"); // azul escuro → texto branco
    expect(tokens["--sf-accent-text"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(tokens["--sf-accent-border"]).toMatch(/^rgba\(\d+, \d+, \d+, 0\.45\)$/);
    expect(tokens["--sf-accent-soft"]).toMatch(/^rgba\(\d+, \d+, \d+, 0\.12\)$/);
    expect(Object.keys(tokens)).toHaveLength(6);
  });

  it("accent-text is lighter than the base (readability on the dark page)", () => {
    const tokens = storefrontAccentTokens("#1e3a8a");
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    for (const i of [0, 1, 2]) {
      expect(channel(tokens["--sf-accent-text"], i)).toBeGreaterThanOrEqual(
        channel(tokens["--sf-accent"], i),
      );
    }
  });
});
