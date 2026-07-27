import { NextResponse } from "next/server";
import { updateProductSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toProductResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** Update a product (rename, reprice, activate/deactivate). */
export const PATCH = route<{ orgId: string; productId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = updateProductSchema.parse(await readJsonBody(request));
    const product = await getServices().offers.updateProduct(ctx, params.productId, input);
    return NextResponse.json({ product: toProductResponse(product) });
  },
);
