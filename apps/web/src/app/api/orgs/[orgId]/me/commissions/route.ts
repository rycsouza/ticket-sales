import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-PRM-012 — promoter self-view: own report only (BR-PRV-003). */
export const GET = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);

  const report = await (await getTenantServices(params.orgId)).promoters.myReport(ctx);

  return NextResponse.json(report);
});
