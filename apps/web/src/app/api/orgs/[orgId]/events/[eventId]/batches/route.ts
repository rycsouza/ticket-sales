import { NextResponse } from "next/server";
import { createSalesBatchSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toBatchResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = createSalesBatchSchema.parse(await readJsonBody(request));

    const batch = await getServices().inventory.createSalesBatch(ctx, params.eventId, input);

    return NextResponse.json(toBatchResponse(batch), { status: 201 });
  },
);

export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const batches = await getServices().inventory.listSalesBatches(ctx, params.eventId);

    return NextResponse.json({ batches: batches.map(toBatchResponse) });
  },
);
