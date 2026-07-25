import { NextResponse } from "next/server";
import { promoterPayoutSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toLedgerEntryResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-FIN-013 — register a promoter commission payout (capped at owed). */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = promoterPayoutSchema.parse(await readJsonBody(request));

    const entry = await getServices().finance.registerPromoterPayout(ctx, params.eventId, {
      promoterId: input.promoterId,
      amountCents: input.amountCents,
      memo: input.memo,
    });

    return NextResponse.json(toLedgerEntryResponse(entry), { status: 201 });
  },
);
