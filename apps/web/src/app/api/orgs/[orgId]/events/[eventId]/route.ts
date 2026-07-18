import { NextResponse } from "next/server";
import { updateEventSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toEventResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const event = await getServices().events.getEvent(ctx, params.eventId);
    return NextResponse.json(toEventResponse(event));
  },
);

export const PATCH = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = updateEventSchema.parse(await readJsonBody(request));

    const event = await getServices().events.updateEventDetails(ctx, params.eventId, input);

    return NextResponse.json(toEventResponse(event));
  },
);
