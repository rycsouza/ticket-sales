import { NextResponse } from "next/server";
import { acceptInviteSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getPlatformServices } from "@/lib/services";

/**
 * Pre-auth endpoint: the single-use invite token IS the authorization.
 * No session required (the invitee may not have an account yet).
 */
export const POST = route(async (request, { correlationId }) => {
  const input = acceptInviteSchema.parse(await readJsonBody(request));

  const { membership } = await getPlatformServices().identity.acceptInvite(input, { correlationId });

  return NextResponse.json(
    { organizationId: membership.organizationId, role: membership.role },
    { status: 201 },
  );
});
