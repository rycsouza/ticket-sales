import { NextResponse } from "next/server";
import { validateTicketSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-CIN-004/005/006 — validate a scanned QR and admit if valid. */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = validateTicketSchema.parse(await readJsonBody(request));
    const result = await (await getTenantServices(params.orgId)).checkin.validateAndCheckIn(ctx, params.eventId, input);
    return NextResponse.json(result);
  },
);
