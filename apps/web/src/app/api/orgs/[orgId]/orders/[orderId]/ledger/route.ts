import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { toLedgerEntryResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-FIN-002 — the financial entries of a single order (finance roles only). */
export const GET = route<{ orgId: string; orderId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const entries = await getServices().finance.getOrderLedger(ctx, params.orderId);

    return NextResponse.json({ entries: entries.map(toLedgerEntryResponse) });
  },
);
