import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

export const GET = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);

  const members = await (await getTenantServices(params.orgId)).identity.listMembers(ctx);

  return NextResponse.json({
    members: members.map((member) => ({
      membershipId: member.id,
      userId: member.userId,
      role: member.role,
      status: member.status,
    })),
  });
});
