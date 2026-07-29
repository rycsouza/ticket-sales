import { NextResponse } from "next/server";
import { createCommissionRuleSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toCommissionRuleResponse } from "@/lib/serializers";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** Organization-wide default commission rule (eventId null). */
export const POST = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const input = createCommissionRuleSchema.parse(await readJsonBody(request));

  const rule = await (await getTenantServices(params.orgId)).promoters.createCommissionRule(ctx, null, input);

  return NextResponse.json(toCommissionRuleResponse(rule), { status: 201 });
});
