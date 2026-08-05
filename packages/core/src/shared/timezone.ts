/**
 * Início do dia-calendário ATUAL no fuso dado, como instante UTC — usado por
 * agregados "de hoje" (dashboard). Sem dependências: resolve o offset da zona
 * via Intl no próprio instante (DST-safe).
 */
export function startOfDayInTimeZone(now: Date, timeZone: string): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone })
    .format(now)
    .split("-")
    .map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  return new Date(utcMidnight - timeZoneOffsetMs(new Date(utcMidnight), timeZone));
}

/** Offset da zona em ms no instante dado (positivo a leste de UTC). */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}
