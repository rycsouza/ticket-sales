import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody, route } from "@/lib/http";
import { toEventResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

const changeCapacitySchema = z
  .object({
    capacityTotal: z.number().int().positive().max(1_000_000),
    justification: z.string().trim().min(5).max(500),
  })
  .strict();

/** FR-EVT-003/010, BR-INV-004 — dedicated, audited capacity change. */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = changeCapacitySchema.parse(await readJsonBody(request));

    const event = await getServices().events.changeEventCapacity(
      ctx,
      params.eventId,
      input.capacityTotal,
      input.justification,
    );

    return NextResponse.json(toEventResponse(event));
  },
);
