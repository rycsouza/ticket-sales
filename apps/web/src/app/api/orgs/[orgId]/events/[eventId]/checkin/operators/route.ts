import { NextResponse } from "next/server";
import { assignOperatorSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toCheckinAssignmentResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-CIN-001/002 — assign / list gate operators for the event. */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = assignOperatorSchema.parse(await readJsonBody(request));
    const assignment = await getServices().checkin.assignOperator(ctx, params.eventId, input);
    return NextResponse.json(toCheckinAssignmentResponse(assignment), { status: 201 });
  },
);

export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const operators = await getServices().checkin.listOperators(ctx, params.eventId);
    return NextResponse.json({ operators: operators.map(toCheckinAssignmentResponse) });
  },
);
