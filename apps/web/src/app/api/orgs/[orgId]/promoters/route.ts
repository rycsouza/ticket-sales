import { NextResponse } from "next/server";
import { createPromoterSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toPromoterResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** Create a lightweight org-level promoter; returns the report token ONCE. */
export const POST = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const input = createPromoterSchema.parse(await readJsonBody(request));

  const { promoter, reportToken } = await getServices().promoters.createPromoter(ctx, input);

  return NextResponse.json({ promoter: toPromoterResponse(promoter), reportToken }, { status: 201 });
});

export const GET = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const promoters = await getServices().promoters.listPromoters(ctx);
  return NextResponse.json({ promoters: promoters.map(toPromoterResponse) });
});
