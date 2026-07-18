import { NextResponse } from "next/server";
import { createEventSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toEventResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

export const POST = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const input = createEventSchema.parse(await readJsonBody(request));

  const event = await getServices().events.createEvent(ctx, input);

  return NextResponse.json(toEventResponse(event), { status: 201 });
});

export const GET = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);

  const events = await getServices().events.listEvents(ctx);

  return NextResponse.json({ events: events.map(toEventResponse) });
});
