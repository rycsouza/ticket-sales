import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody, requestMetaFrom, route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

const changeStatusSchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
    justification: z.string().trim().min(5).max(500),
  })
  .strict();

/** FR-ORG-007 — suspend/reactivate/revoke access without deleting history. */
export const PATCH = route<{ orgId: string; membershipId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = changeStatusSchema.parse(await readJsonBody(request));
    const services = getServices();

    const updated = await services.identity.changeMembershipStatus(
      ctx,
      params.membershipId,
      input.status,
      input.justification,
    );

    // EP-01 acceptance: revoking access ends the user's sessions.
    if (input.status === "REVOKED") {
      const meta = requestMetaFrom(request, correlationId);
      await services.auth.revokeAllSessions(updated.userId, {
        ...meta,
        actorUserId: ctx.userId,
      });
    }

    return NextResponse.json({
      membershipId: updated.id,
      status: updated.status,
    });
  },
);
