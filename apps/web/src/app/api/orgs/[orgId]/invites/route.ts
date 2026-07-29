import { NextResponse } from "next/server";
import { inviteUserSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

export const POST = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const input = inviteUserSchema.parse(await readJsonBody(request));

  const { invite, rawToken } = await (await getTenantServices(params.orgId)).identity.inviteUser(ctx, input);

  // rawToken is returned ONCE so the caller can build the invite link.
  // From Fase 2 on it goes out by e-mail instead (FR-ORG-003 + notifications).
  return NextResponse.json(
    {
      inviteId: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      token: rawToken,
    },
    { status: 201 },
  );
});
