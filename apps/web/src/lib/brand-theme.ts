/**
 * Deriva os tokens --color-brand* a partir de uma única cor hex do produtor.
 * Puro e sem dependências: mistura linear para hover/active/soft/border e
 * luminância relativa (WCAG) para escolher o foreground legível.
 *
 * globals.css declara os tokens como sobrescrevíveis num wrapper — este
 * utilitário é a única fonte dos overrides por evento.
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Mistura linear de `color` com `target` na proporção `amount` (0..1). */
function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return {
    r: color.r + (target.r - color.r) * amount,
    g: color.g + (target.g - color.g) * amount,
    b: color.b + (target.b - color.b) * amount,
  };
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** Luminância relativa (WCAG 2.x). */
function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// Mesmo tom de tinta usado por --color-ink no globals.css
const INK: Rgb = { r: 17, g: 24, b: 39 }; // #111827

export type BrandTokens = Partial<
  Record<
    | "--color-brand"
    | "--color-brand-hover"
    | "--color-brand-active"
    | "--color-brand-soft"
    | "--color-brand-border"
    | "--color-brand-fg",
    string
  >
>;

/**
 * Overrides de tema para a cor do produtor. Entrada inválida devolve `{}` —
 * um valor ruim no banco jamais injeta CSS na página pública.
 */
export function brandTokens(hex: string | null | undefined): BrandTokens {
  if (!hex || !HEX_RE.test(hex)) return {};
  const base = hexToRgb(hex);

  // Foreground: branco quando contrasta melhor; senão a tinta padrão.
  const fg = contrastRatio(base, WHITE) >= contrastRatio(base, INK) ? "#ffffff" : "#111827";

  return {
    "--color-brand": rgbToHex(base),
    "--color-brand-hover": rgbToHex(mix(base, BLACK, 0.12)),
    "--color-brand-active": rgbToHex(mix(base, BLACK, 0.24)),
    "--color-brand-soft": rgbToHex(mix(base, WHITE, 0.92)),
    "--color-brand-border": rgbToHex(mix(base, WHITE, 0.7)),
    "--color-brand-fg": fg,
  };
}
