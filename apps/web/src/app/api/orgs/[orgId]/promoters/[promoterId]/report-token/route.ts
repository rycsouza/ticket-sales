import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** Rotate a promoter's private report token — invalidates the previous link. */
export const POST = route<{ orgId: string; promoterId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const reportToken = await getServices().promoters.regenerateReportToken(ctx, params.promoterId);
    return NextResponse.json({ reportToken }, { status: 201 });
  },
);
