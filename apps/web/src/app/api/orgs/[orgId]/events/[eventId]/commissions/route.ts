import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { toPromoterSummaryResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-PRM-013 — commission ranking / performance by promoter for the event. */
export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const ranking = await getServices().promoters.eventRanking(ctx, params.eventId);

    return NextResponse.json({ ranking: ranking.map(toPromoterSummaryResponse) });
  },
);
