import { NextResponse } from "next/server";
import { transferTicketSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toTicketResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/**
 * FR-TKT-007/008 — transfer ownership. The previous token is invalidated and a
 * fresh access path is returned for the staff member to deliver to the new
 * holder (the raw token lives only in that link, never persisted).
 */
export const POST = route<{ orgId: string; ticketId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = transferTicketSchema.parse(await readJsonBody(request));

    const { ticket, rawToken } = await getServices().ticketsService.transferTicket(
      ctx,
      params.ticketId,
      input,
    );

    return NextResponse.json({
      ticket: toTicketResponse(ticket),
      ticketPath: `/t/${rawToken}`,
    });
  },
);
