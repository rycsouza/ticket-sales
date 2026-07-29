import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getPlatformServices, getTenantServices, resolveOrgByRef } from "@/lib/services";

/**
 * Mercado Pago webhook (FR-PAY-005..007). The signature IS the auth; the
 * event is persisted before processing and every effect downstream is
 * idempotent. A processing failure returns 500 so the provider retries.
 *
 * Multi-tenant (docs/MULTITENANT.md §3): the platform is the single PSP
 * recipient, so the payload carries NO tenant hint. Verify the signature on
 * the platform plane, resolve the owning org via the PROVIDER_TX ref written
 * at charge creation, then process on THAT tenant's graph (the global dedupe
 * by providerEventId already lives on the platform DB inside processWebhook).
 */
export const POST = route(async (request, { correlationId }) => {
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Signature check needs no DB — unverifiable payloads answer 200 (no oracle).
  const normalized = await getPlatformServices().psp.verifyAndParseWebhook({ headers, rawBody });
  if (!normalized) return NextResponse.json({ outcome: "ignored" });

  const organizationId = await resolveOrgByRef("PROVIDER_TX", normalized.providerTransactionId);
  if (!organizationId) {
    // Charge created but the routing ref hasn't landed yet (write-after race)
    // — 500 makes the provider redeliver after the ref settles.
    return NextResponse.json({ outcome: "unrouted", correlationId }, { status: 500 });
  }

  const services = await getTenantServices(organizationId);
  const outcome = await services.payments.processWebhook({ headers, rawBody }, { correlationId });

  // Always 200 for verified-and-handled outcomes (incl. duplicates) so the
  // provider stops retrying.
  return NextResponse.json(outcome);
});
