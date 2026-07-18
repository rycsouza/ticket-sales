import { NextResponse } from "next/server";
import { z } from "zod";
import { blockTicketSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toTicketResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

const statusActionSchema = z
  .object({
    action: z.enum(["block", "unblock"]),
    justification: z.string().trim().min(5).max(500),
  })
  .strict();

/** FR-TKT-009 / FR-ADM-004 — block/unblock a ticket with justification. */
export const POST = route<{ orgId: string; ticketId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = statusActionSchema.parse(await readJsonBody(request));
    // Re-validate the justification through the domain schema too.
    blockTicketSchema.parse({ justification: input.justification });
    const { ticketsService } = getServices();

    const ticket =
      input.action === "block"
        ? await ticketsService.blockTicket(ctx, params.ticketId, { justification: input.justification })
        : await ticketsService.unblockTicket(ctx, params.ticketId, {
            justification: input.justification,
          });

    return NextResponse.json(toTicketResponse(ticket));
  },
);
