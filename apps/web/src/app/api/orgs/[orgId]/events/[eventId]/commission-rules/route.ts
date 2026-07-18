import { NextResponse } from "next/server";
import { createCommissionRuleSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toCommissionRuleResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** FR-PRM-008/009/015 — versioned commission rules for the event. */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = createCommissionRuleSchema.parse(await readJsonBody(request));

    const rule = await getServices().promoters.createCommissionRule(ctx, params.eventId, input);

    return NextResponse.json(toCommissionRuleResponse(rule), { status: 201 });
  },
);

export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const rules = await getServices().promoters.listCommissionRules(ctx, params.eventId);

    return NextResponse.json({ rules: rules.map(toCommissionRuleResponse) });
  },
);
