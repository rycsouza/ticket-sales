import { NextResponse } from "next/server";
import { linkPromoterSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toPromoterAssignmentResponse } from "@/lib/serializers";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-PRM-003 — link a promoter to an event; list linked promoters. */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = linkPromoterSchema.parse(await readJsonBody(request));

    const assignment = await (await getTenantServices(params.orgId)).promoters.linkPromoterToEvent(
      ctx,
      params.eventId,
      input,
    );

    return NextResponse.json(toPromoterAssignmentResponse(assignment), { status: 201 });
  },
);

export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const assignments = await (await getTenantServices(params.orgId)).promoters.listEventAssignments(ctx, params.eventId);

    return NextResponse.json({ promoters: assignments.map(toPromoterAssignmentResponse) });
  },
);
