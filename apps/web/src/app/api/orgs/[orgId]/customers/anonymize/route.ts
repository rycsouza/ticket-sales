import { NextResponse } from "next/server";
import { anonymizeCustomerSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** LGPD erasure on request — anonymize a customer's PII (audited). */
export const POST = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const input = anonymizeCustomerSchema.parse(await readJsonBody(request));

  await getServices().customers.anonymizeCustomer(ctx, input.email);

  return NextResponse.json({ ok: true });
});
