import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { toFinancialSummaryResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-FIN-003/008 — event financial summary, reproducible from the ledger. */
export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const summary = await getServices().finance.getEventFinancialSummary(ctx, params.eventId);

    return NextResponse.json(toFinancialSummaryResponse(summary));
  },
);
