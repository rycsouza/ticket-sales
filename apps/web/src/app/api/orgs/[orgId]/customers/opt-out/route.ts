import { NextResponse } from "next/server";
import { setOptOutSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toCustomerResponse } from "@/lib/serializers";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-CRM-008 — set/clear a customer's communication opt-out (audited). */
export const POST = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const input = setOptOutSchema.parse(await readJsonBody(request));

  const customer = await (await getTenantServices(params.orgId)).customers.setOptOut(ctx, input);

  return NextResponse.json(toCustomerResponse(customer));
});
