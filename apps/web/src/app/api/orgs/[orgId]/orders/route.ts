import { NextResponse } from "next/server";
import { searchOrdersSchema } from "@ingressos/core";
import { route } from "@/lib/http";
import { toOrderSearchRowResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-ADM-001 — order search for the support console (org-scoped, bounded). */
export const GET = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);

  const url = new URL(request.url);
  const raw = {
    ...(url.searchParams.get("q") ? { q: url.searchParams.get("q") } : {}),
    ...(url.searchParams.get("status") ? { status: url.searchParams.get("status") } : {}),
    ...(url.searchParams.get("eventId") ? { eventId: url.searchParams.get("eventId") } : {}),
    ...(url.searchParams.get("limit") ? { limit: url.searchParams.get("limit") } : {}),
  };
  const input = searchOrdersSchema.parse(raw);

  const orders = await getServices().support.searchOrders(ctx, input);

  return NextResponse.json({ orders: orders.map(toOrderSearchRowResponse) });
});
