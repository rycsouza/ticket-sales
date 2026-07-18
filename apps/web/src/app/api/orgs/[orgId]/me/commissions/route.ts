import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { toPromoterSummaryResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-PRM-012 — promoter self-view: own commission summary only (BR-PRV-003). */
export const GET = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);

  const summary = await getServices().promoters.myCommissionSummary(ctx);

  return NextResponse.json(toPromoterSummaryResponse(summary));
});
