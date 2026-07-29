import { NextResponse } from "next/server";
import { correctParticipantSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toTicketResponse } from "@/lib/serializers";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-TKT-012/013 — correct non-financial participant data (audited). */
export const POST = route<{ orgId: string; ticketId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = correctParticipantSchema.parse(await readJsonBody(request));

    const ticket = await (await getTenantServices(params.orgId)).ticketsService.correctParticipant(ctx, params.ticketId, input);

    return NextResponse.json(toTicketResponse(ticket));
  },
);
