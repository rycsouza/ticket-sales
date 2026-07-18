import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { requireAuth } from "@/lib/session";

export const GET = route(async (request) => {
  const { userId } = await requireAuth(request);
  const services = getServices();

  const organizations = await services.identity.listMyOrganizations(userId);

  // Minimal output — never the full user row (no passwordHash, ever).
  return NextResponse.json({
    userId,
    organizations: organizations.map(({ organization, role }) => ({
      id: organization.id,
      name: organization.name,
      role,
    })),
  });
});
