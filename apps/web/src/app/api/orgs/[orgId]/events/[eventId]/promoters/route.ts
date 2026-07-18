import { NextResponse } from "next/server";
import { assignPromoterSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toPromoterAssignmentResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-PRM-003 — assign a promoter to an event; list assigned promoters. */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = assignPromoterSchema.parse(await readJsonBody(request));

    const assignment = await getServices().promoters.assignPromoter(ctx, params.eventId, input);

    return NextResponse.json(toPromoterAssignmentResponse(assignment), { status: 201 });
  },
);

export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const promoters = await getServices().promoters.listPromoters(ctx, params.eventId);

    return NextResponse.json({ promoters: promoters.map(toPromoterAssignmentResponse) });
  },
);
