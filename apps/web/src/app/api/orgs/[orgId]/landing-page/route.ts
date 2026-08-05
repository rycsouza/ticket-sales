import { NextResponse } from "next/server";
import { parseStoredTrustItems, updateOrgLandingPageSchema, type OrgLandingPageRecord } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getPlatformServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";
import { resolvePlatformAdmin } from "@/lib/platform-admin";
import { NotFoundOrForbiddenError } from "@ingressos/core";

// A vitrine vive no plano de controle (platform DB) — funciona mesmo antes
// do banco do tenant existir, como as demais rotas de identidade.

function toResponse(page: OrgLandingPageRecord | null) {
  if (!page) return { page: null };
  const { trustItems, updatedAt, ...rest } = page;
  void updatedAt;
  return { page: { ...rest, trustItems: parseStoredTrustItems(trustItems) } };
}

export const GET = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  // Superfície de admin da plataforma: além de membro, exige a allowlist.
  if (!(await resolvePlatformAdmin())) throw new NotFoundOrForbiddenError();
  const page = await getPlatformServices().storefront.getForOrg(ctx);
  return NextResponse.json(toResponse(page));
});

export const PATCH = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  // Superfície de admin da plataforma: além de membro, exige a allowlist.
  if (!(await resolvePlatformAdmin())) throw new NotFoundOrForbiddenError();
  const input = updateOrgLandingPageSchema.parse(await readJsonBody(request));
  const page = await getPlatformServices().storefront.update(ctx, input);
  return NextResponse.json(toResponse(page));
});
