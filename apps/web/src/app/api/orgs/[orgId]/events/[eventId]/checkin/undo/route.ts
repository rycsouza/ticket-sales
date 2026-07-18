import { NextResponse } from "next/server";
import { undoCheckinSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-CIN-010 — undo a check-in (coordinator, justified, audited). */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = undoCheckinSchema.parse(await readJsonBody(request));
    await getServices().checkin.undoCheckIn(ctx, params.eventId, input);
    return NextResponse.json({ ok: true });
  },
);
