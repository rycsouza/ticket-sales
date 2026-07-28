import { NextResponse } from "next/server";
import { updateSalesBatchSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toBatchResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** Edit a batch (name, price, sales window, per-order cap, quantity). */
export const PATCH = route<{ orgId: string; batchId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = updateSalesBatchSchema.parse(await readJsonBody(request));
    const batch = await getServices().inventory.updateSalesBatch(ctx, params.batchId, input);
    return NextResponse.json(toBatchResponse(batch));
  },
);
