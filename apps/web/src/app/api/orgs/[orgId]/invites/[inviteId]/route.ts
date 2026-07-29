import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

/** Revokes a pending invite (FR-ORG-004). */
export const DELETE = route<{ orgId: string; inviteId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    await (await getTenantServices(params.orgId)).identity.revokeInvite(ctx, params.inviteId);

    return NextResponse.json({ ok: true });
  },
);
