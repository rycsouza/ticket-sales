/**
 * Input formatting + validation helpers (pt-BR). Keep display formatting here
 * and reuse across every form so masks/validation stay consistent.
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
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

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
