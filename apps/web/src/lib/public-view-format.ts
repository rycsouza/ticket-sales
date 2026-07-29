/**
 * Pure presentation helpers for the public sales page. Deliberately free of
 * `server-only` (and of any data-fetching) so client components in the checkout
 * tree — e.g. the hero — can import them without dragging server code into the
 * browser bundle. Server code re-exports these from ./public-views.
 */
export function formatBRL(centsValue: number): string {
  return (centsValue / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatEventDate(date: Date | null, timezone: string): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}
