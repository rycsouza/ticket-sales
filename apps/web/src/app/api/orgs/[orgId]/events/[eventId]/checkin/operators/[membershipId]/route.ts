import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { toCheckinAssignmentResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-CIN-001 — revoke a gate operator (soft: deactivate the assignment). */
export const DELETE = route<{ orgId: string; eventId: string; membershipId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const assignment = await getServices().checkin.revokeOperator(
      ctx,
      params.eventId,
      params.membershipId,
    );
    return NextResponse.json(toCheckinAssignmentResponse(assignment));
  },
);
