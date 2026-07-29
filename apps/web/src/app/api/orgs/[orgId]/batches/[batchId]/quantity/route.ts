import { NextResponse } from "next/server";
import { updateBatchQuantitySchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toBatchResponse } from "@/lib/serializers";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-INV-009 — audited quantity change, never below committed. */
export const PATCH = route<{ orgId: string; batchId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = updateBatchQuantitySchema.parse(await readJsonBody(request));

    const batch = await (await getTenantServices(params.orgId)).inventory.updateBatchQuantity(
      ctx,
      params.batchId,
      input.quantityTotal,
      input.justification,
    );

    return NextResponse.json(toBatchResponse(batch));
  },
);
