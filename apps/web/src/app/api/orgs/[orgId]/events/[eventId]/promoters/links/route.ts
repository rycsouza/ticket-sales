import { NextResponse } from "next/server";
import { createPromoterLinkSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toPromoterLinkResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-PRM-004 — trackable link per promoter per event (idempotent). */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = createPromoterLinkSchema.parse(await readJsonBody(request));

    const link = await getServices().promoters.createLink(ctx, params.eventId, input);

    return NextResponse.json(toPromoterLinkResponse(link), { status: 201 });
  },
);

export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const links = await getServices().promoters.listLinks(ctx, params.eventId);

    return NextResponse.json({ links: links.map(toPromoterLinkResponse) });
  },
);
