import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { toAuditEventResponse, toTicketResponse } from "@/lib/serializers";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-TKT-011 — current status plus the audited history of the ticket. */
export const GET = route<{ orgId: string; ticketId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const { ticket, history } = await (await getTenantServices(params.orgId)).ticketsService.getTicketHistory(
      ctx,
      params.ticketId,
    );

    return NextResponse.json({
      ticket: toTicketResponse(ticket),
      history: history.map(toAuditEventResponse),
    });
  },
);
