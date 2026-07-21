/**
 * Input formatting + validation helpers (pt-BR). Keep display formatting here
 * and reuse across every form so masks/validation stay consistent.
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** pt-BR pluralization: pluralize(1,"comprador","compradores") → "1 comprador". */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString("pt-BR")} ${count === 1 ? singular : plural}`;
}

/**
 * BR phone mask: (XX) XXXXX-XXXX (mobile, 11 digits) or (XX) XXXX-XXXX
 * (landline, 10). Progressive — formats partial input as the user types.
 */
export function formatBRPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

/** WhatsApp = BR mobile: 11 digits (DDD + 9 + 8). This is the "ideal size". */
export function isCompleteMobilePhone(digits: string): boolean {
  return onlyDigits(digits).length === 11;
}

/**
 * wa.me deep link for a stored (digits-only) phone. BR numbers are stored
 * without a country code, so prepend 55 for local 10/11-digit numbers.
 * Returns null when the number is too short to be dialable.
 */
export function whatsappUrl(phone: string | null | undefined): string | null {
  const d = onlyDigits(phone ?? "");
  if (d.length < 10) return null;
  const withCountry = d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
  return `https://wa.me/${withCountry}`;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** E-mails never contain spaces and are case-insensitive — normalize as typed. */
export function sanitizeEmail(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

/**
 * Full-name field: keep only letters (incl. accented), spaces, apostrophes and
 * hyphens — strips digits and stray symbols, collapses inner runs of spaces and
 * drops any leading space. A single trailing space is preserved so the buyer can
 * type between first and last name.
 */
export function sanitizeName(value: string): string {
  return value
    .replace(/[^\p{L}\s'’-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/, "");
}

// pt-BR name connectors that stay lowercase when title-casing (except leading).
const NAME_PARTICLES = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "van", "von"]);

/** Title-cases a name on blur (keeps pt-BR connectors lowercase). */
export function titleCaseName(value: string): string {
  return sanitizeName(value)
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word, i) => {
      const lower = word.toLocaleLowerCase("pt-BR");
      if (i > 0 && NAME_PARTICLES.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
    })
    .join(" ");
}

/** Requires a real full name: first + last, each with letters (no digits). */
export function isValidFullName(value: string): boolean {
  const parts = sanitizeName(value).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  return letters(first) >= 2 && letters(last) >= 2;
}
