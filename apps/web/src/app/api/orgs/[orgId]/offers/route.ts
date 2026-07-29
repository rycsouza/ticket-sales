import { NextResponse } from "next/server";
import { createOfferSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toOfferResponse } from "@/lib/serializers";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** Create an offer (upsell / order bump) targeting a batch or a product. */
export const POST = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const input = createOfferSchema.parse(await readJsonBody(request));
  const offer = await (await getTenantServices(params.orgId)).offers.createOffer(ctx, input);
  return NextResponse.json({ offer: toOfferResponse(offer) }, { status: 201 });
});

export const GET = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const offers = await (await getTenantServices(params.orgId)).offers.listOffers(ctx);
  return NextResponse.json({ offers: offers.map(toOfferResponse) });
});
