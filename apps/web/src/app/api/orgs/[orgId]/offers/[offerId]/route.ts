import { NextResponse } from "next/server";
import { updateOfferSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toOfferResponse } from "@/lib/serializers";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** Update an offer (copy, price override, order, activate/deactivate). */
export const PATCH = route<{ orgId: string; offerId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = updateOfferSchema.parse(await readJsonBody(request));
    const offer = await (await getTenantServices(params.orgId)).offers.updateOffer(ctx, params.offerId, input);
    return NextResponse.json({ offer: toOfferResponse(offer) });
  },
);
