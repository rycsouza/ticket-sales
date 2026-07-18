import { csvResponse, toCsv } from "@/lib/csv";
import { route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-FIN-009 — export the event ledger as CSV (audited via the service). */
export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const entries = await getServices().finance.getEventLedgerForExport(ctx, params.eventId);

    const csv = toCsv(
      ["data", "conta", "tipo", "valor_centavos", "pedido", "promoter", "memo"],
      entries.map((e) => [
        e.createdAt.toISOString(),
        e.account,
        e.type,
        e.amountCents,
        e.orderId,
        e.membershipId,
        e.memo,
      ]),
    );
    return csvResponse(`financeiro-${params.eventId}.csv`, csv);
  },
);
