import { NextResponse } from "next/server";
import { createCouponSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toCouponResponse } from "@/lib/serializers";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** Organization-wide default coupon (eventId null); applies to any event. */
export const POST = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const input = createCouponSchema.parse(await readJsonBody(request));

  const coupon = await (await getTenantServices(params.orgId)).promoters.createCoupon(ctx, null, input);

  return NextResponse.json(toCouponResponse(coupon), { status: 201 });
});
