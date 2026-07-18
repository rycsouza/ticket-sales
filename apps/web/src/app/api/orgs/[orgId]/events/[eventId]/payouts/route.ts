import { NextResponse } from "next/server";
import { registerPayoutSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toLedgerEntryResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-FIN-013 — register an externally-executed payout (manual in the MVP). */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = registerPayoutSchema.parse(await readJsonBody(request));

    const entry = await getServices().finance.registerExternalPayout(ctx, params.eventId, input);

    return NextResponse.json(toLedgerEntryResponse(entry), { status: 201 });
  },
);
