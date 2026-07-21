/**
 * Client-side buyer convenience prefs (first-party cookie on the buyer's own
 * device). Only the buyer's own WhatsApp number is remembered, to prefill the
 * checkout on a return purchase — never anyone else's data.
 */
const PHONE_COOKIE = "ingressos_phone";
const MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // 180 days

/** Stored WhatsApp digits, or "" when absent. Safe to call on the server. */
export function getStoredPhone(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)ingressos_phone=([^;]*)/);
  return match ? decodeURIComponent(match[1]!).replace(/\D/g, "") : "";
}

/** Remember the buyer's WhatsApp (digits only) after a successful purchase. */
export function setStoredPhone(phone: string): void {
  if (typeof document === "undefined") return;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${PHONE_COOKIE}=${encodeURIComponent(digits)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}
