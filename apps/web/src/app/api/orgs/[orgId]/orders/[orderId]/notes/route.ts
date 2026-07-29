import { NextResponse } from "next/server";
import { addOrderNoteSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toOrderNoteResponse } from "@/lib/serializers";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-ADM-009 — internal notes on an order (never exposed to the buyer). */
export const POST = route<{ orgId: string; orderId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = addOrderNoteSchema.parse(await readJsonBody(request));

    const note = await (await getTenantServices(params.orgId)).support.addNote(ctx, params.orderId, input);

    return NextResponse.json(toOrderNoteResponse(note), { status: 201 });
  },
);

export const GET = route<{ orgId: string; orderId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const notes = await (await getTenantServices(params.orgId)).support.listNotes(ctx, params.orderId);

    return NextResponse.json({ notes: notes.map(toOrderNoteResponse) });
  },
);
