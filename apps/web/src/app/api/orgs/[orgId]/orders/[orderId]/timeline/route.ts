import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { toOrderTimelineResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-ADM-002 — unified order timeline for support/finance. */
export const GET = route<{ orgId: string; orderId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const timeline = await getServices().support.getOrderTimeline(ctx, params.orderId);

    return NextResponse.json(toOrderTimelineResponse(timeline));
  },
);
