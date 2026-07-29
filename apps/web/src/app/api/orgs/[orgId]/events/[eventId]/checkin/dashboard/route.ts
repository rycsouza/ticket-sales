import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-CIN-018 — sold / present / absent / entry rate for the event. */
export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const dashboard = await (await getTenantServices(params.orgId)).checkin.dashboard(ctx, params.eventId);
    return NextResponse.json(dashboard);
  },
);
