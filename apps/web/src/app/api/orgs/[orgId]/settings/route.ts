import { NextResponse } from "next/server";
import { updateOrganizationSettingsSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getPlatformServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

// Identity lives on the PLATFORM plane — settings work even before the
// tenant database is provisioned (unlike business routes).
export const PATCH = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  const input = updateOrganizationSettingsSchema.parse(await readJsonBody(request));

  const organization = await getPlatformServices().identity.updateOrganizationSettings(ctx, input);

  return NextResponse.json({
    timezone: organization.timezone,
    niche: organization.niche,
  });
});
