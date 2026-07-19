import { NextResponse } from "next/server";
import { updateEventPageSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toEventPageResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const page = await getServices().eventPage.getPage(ctx, params.eventId);
    return NextResponse.json(toEventPageResponse(page));
  },
);

export const PUT = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = updateEventPageSchema.parse(await readJsonBody(request));

    const page = await getServices().eventPage.updatePage(ctx, params.eventId, input);

    return NextResponse.json(toEventPageResponse(page));
  },
);
