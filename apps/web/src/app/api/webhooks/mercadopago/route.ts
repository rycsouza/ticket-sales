import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getServices } from "@/lib/services";

/**
 * Mercado Pago webhook (FR-PAY-005..007). The signature IS the auth; the
 * event is persisted before processing and every effect downstream is
 * idempotent. A processing failure returns 500 so the provider retries.
 */
export const POST = route(async (request, { correlationId }) => {
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const outcome = await getServices().payments.processWebhook(
    { headers, rawBody },
    { correlationId },
  );

  // Always 200 for verified-and-handled outcomes (incl. duplicates) so the
  // provider stops retrying; unverifiable payloads are 200 too — no oracle.
  return NextResponse.json(outcome);
});
