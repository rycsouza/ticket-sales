import { segmentFilterSchema } from "@ingressos/core";
import { csvResponse, toCsv } from "@/lib/csv";
import { readJsonBody, route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-CRM-006/007 — export a segment as CSV (audited via the service). */
export const POST = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const filter = segmentFilterSchema.parse(await readJsonBody(request));

  const segment = await getServices().customers.getSegmentForExport(ctx, filter);

  const csv = toCsv(
    ["email", "nome", "telefone", "pedidos", "total_gasto_centavos", "opt_out"],
    segment.customers.map((c) => [
      c.email,
      c.name,
      c.phone,
      c.orderCount,
      c.totalSpentCents,
      c.optedOut,
    ]),
  );
  return csvResponse("compradores.csv", csv);
});
