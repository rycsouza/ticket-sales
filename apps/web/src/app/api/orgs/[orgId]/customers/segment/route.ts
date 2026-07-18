import { NextResponse } from "next/server";
import { segmentFilterSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toSegmentResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/**
 * FR-CRM-003 — reproducible buyer segment. POST carries the filter body (a read
 * with structured input; nothing is mutated).
 */
export const POST = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const filter = segmentFilterSchema.parse(await readJsonBody(request));

  const segment = await getServices().customers.getSegment(ctx, filter);

  return NextResponse.json(toSegmentResponse(segment));
});
