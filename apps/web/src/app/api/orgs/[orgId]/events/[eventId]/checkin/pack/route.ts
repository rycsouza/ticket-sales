import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-CIN-011/012 — download the offline validation pack (token hashes only). */
export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const pack = await (await getTenantServices(params.orgId)).checkin.buildOfflinePack(ctx, params.eventId);
    return NextResponse.json(pack);
  },
);
