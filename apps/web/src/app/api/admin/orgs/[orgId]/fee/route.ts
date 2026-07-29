import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody, route } from "@/lib/http";
import { getPlatformServices } from "@/lib/services";
import { resolvePlatformAdmin } from "@/lib/platform-admin";

const orgFeeSchema = z
  .object({
    defaultPlatformFeeBps: z.number().int().min(0).max(10_000),
    defaultFeeMode: z.enum(["BUYER", "PRODUCER"]),
  })
  .strict();

/** Platform-admin: set an organization's default platform fee (DEC-003). */
export const PATCH = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const admin = await resolvePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Recurso não encontrado." }, { status: 404 });

  const input = orgFeeSchema.parse(await readJsonBody(request));
  const org = await getPlatformServices().identity.setOrgDefaultFeeAsPlatformAdmin({
    organizationId: params.orgId,
    actorUserId: admin.userId,
    defaultPlatformFeeBps: input.defaultPlatformFeeBps,
    defaultFeeMode: input.defaultFeeMode,
    correlationId,
  });

  return NextResponse.json({
    id: org.id,
    defaultPlatformFeeBps: org.defaultPlatformFeeBps,
    defaultFeeMode: org.defaultFeeMode,
  });
});
