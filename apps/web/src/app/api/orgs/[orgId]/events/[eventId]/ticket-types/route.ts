import { NextResponse } from "next/server";
import { createTicketTypeSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toTicketTypeResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = createTicketTypeSchema.parse(await readJsonBody(request));

    const ticketType = await getServices().inventory.createTicketType(
      ctx,
      params.eventId,
      input,
    );

    return NextResponse.json(toTicketTypeResponse(ticketType), { status: 201 });
  },
);

export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const ticketTypes = await getServices().inventory.listTicketTypes(ctx, params.eventId);

    return NextResponse.json({ ticketTypes: ticketTypes.map(toTicketTypeResponse) });
  },
);
