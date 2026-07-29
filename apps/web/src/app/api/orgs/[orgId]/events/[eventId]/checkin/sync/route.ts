import { NextResponse } from "next/server";
import { syncBatchSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-CIN-016/017 — sync offline admissions (idempotent + conflict-detecting). */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = syncBatchSchema.parse(await readJsonBody(request));
    const result = await (await getTenantServices(params.orgId)).checkin.syncOfflineBatch(ctx, params.eventId, input);
    return NextResponse.json(result);
  },
);
