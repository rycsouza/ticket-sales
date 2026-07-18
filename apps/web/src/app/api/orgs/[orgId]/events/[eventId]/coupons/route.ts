import { NextResponse } from "next/server";
import { createCouponSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toCouponResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-PRM-005 / FR-CHK-008 — create and list coupons for the event. */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = createCouponSchema.parse(await readJsonBody(request));

    const coupon = await getServices().promoters.createCoupon(ctx, params.eventId, input);

    return NextResponse.json(toCouponResponse(coupon), { status: 201 });
  },
);

export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const coupons = await getServices().promoters.listCoupons(ctx, params.eventId);

    return NextResponse.json({ coupons: coupons.map(toCouponResponse) });
  },
);
