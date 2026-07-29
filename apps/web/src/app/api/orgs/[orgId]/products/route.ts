import { NextResponse } from "next/server";
import { createProductSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toProductResponse } from "@/lib/serializers";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** Create a standalone add-on product (org-level). */
export const POST = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const input = createProductSchema.parse(await readJsonBody(request));
  const product = await (await getTenantServices(params.orgId)).offers.createProduct(ctx, input);
  return NextResponse.json({ product: toProductResponse(product) }, { status: 201 });
});

export const GET = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const products = await (await getTenantServices(params.orgId)).offers.listProducts(ctx);
  return NextResponse.json({ products: products.map(toProductResponse) });
});
