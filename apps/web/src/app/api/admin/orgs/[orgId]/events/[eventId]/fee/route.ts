import { NextResponse } from "next/server";
import { setEventFeeSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { resolvePlatformAdmin } from "@/lib/platform-admin";

/** Platform-admin: override the platform fee for a single event (DEC-003). */
export const PATCH = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const admin = await resolvePlatformAdmin();
    if (!admin) return NextResponse.json({ error: "Recurso não encontrado." }, { status: 404 });

    const fee = setEventFeeSchema.parse(await readJsonBody(request));
    const event = await getServices().events.setEventFeeAsPlatformAdmin({
      organizationId: params.orgId,
      eventId: params.eventId,
      actorUserId: admin.userId,
      fee,
      correlationId,
    });

    return NextResponse.json({
      id: event.id,
      platformFeeBps: event.platformFeeBps,
      feeMode: event.feeMode,
    });
  },
);
