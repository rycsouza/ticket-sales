import { NextResponse } from "next/server";
import { manualCheckinSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-CIN-009 — exceptional manual admission (coordinator, justified). */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = manualCheckinSchema.parse(await readJsonBody(request));
    const result = await getServices().checkin.manualCheckIn(ctx, params.eventId, input);
    return NextResponse.json(result);
  },
);
