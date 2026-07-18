import { NextResponse } from "next/server";
import { createOrganizationSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { requireAuth } from "@/lib/session";

export const POST = route(async (request, { correlationId }) => {
  const { userId } = await requireAuth(request);
  const input = createOrganizationSchema.parse(await readJsonBody(request));

  const organization = await getServices().identity.createOrganization(input, {
    userId,
    correlationId,
  });

  return NextResponse.json(
    { id: organization.id, name: organization.name },
    { status: 201 },
  );
});

export const GET = route(async (request) => {
  const { userId } = await requireAuth(request);
  const organizations = await getServices().identity.listMyOrganizations(userId);

  return NextResponse.json({
    organizations: organizations.map(({ organization, role }) => ({
      id: organization.id,
      name: organization.name,
      role,
    })),
  });
});
