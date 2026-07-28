import { NextResponse } from "next/server";
import { updateTicketTypeSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toTicketTypeResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** Rename a ticket type or toggle its visibility (active). */
export const PATCH = route<{ orgId: string; eventId: string; ticketTypeId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = updateTicketTypeSchema.parse(await readJsonBody(request));
    const type = await getServices().inventory.updateTicketType(ctx, params.ticketTypeId, input);
    return NextResponse.json(toTicketTypeResponse(type));
  },
);
