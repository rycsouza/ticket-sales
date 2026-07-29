import { NextResponse } from "next/server";
import { registerPayoutSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toLedgerEntryResponse } from "@/lib/serializers";
import { getTenantServices } from "@/lib/services";
import { resolvePlatformAdmin } from "@/lib/platform-admin";

/** Platform-admin: register an externally-executed producer payout (FR-FIN-013). */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const admin = await resolvePlatformAdmin();
    if (!admin) return NextResponse.json({ error: "Recurso não encontrado." }, { status: 404 });

    const input = registerPayoutSchema.parse(await readJsonBody(request));
    const entry = await (await getTenantServices(params.orgId)).finance.registerExternalPayoutAsPlatformAdmin({
      organizationId: params.orgId,
      eventId: params.eventId,
      actorUserId: admin.userId,
      amountCents: input.amountCents,
      memo: input.memo,
      correlationId,
    });

    return NextResponse.json(toLedgerEntryResponse(entry), { status: 201 });
  },
);
