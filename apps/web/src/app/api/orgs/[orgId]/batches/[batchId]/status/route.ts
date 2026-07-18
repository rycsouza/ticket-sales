import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody, route } from "@/lib/http";
import { toBatchResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

const batchActionSchema = z
  .object({
    action: z.enum(["open", "close"]),
  })
  .strict();

/** Manual batch lifecycle (FR-INV-011); automatic windows arrive in Fase 2. */
export const POST = route<{ orgId: string; batchId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = batchActionSchema.parse(await readJsonBody(request));
    const { inventory } = getServices();

    const batch =
      input.action === "open"
        ? await inventory.openBatch(ctx, params.batchId)
        : await inventory.closeBatch(ctx, params.batchId);

    return NextResponse.json(toBatchResponse(batch));
  },
);
