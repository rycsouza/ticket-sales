import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPlatformServices } from "@/lib/services";
import { requireDashboardUser } from "@/lib/dashboard";
import { currentUserIsPlatformAdmin } from "@/lib/platform-admin";
import { PanelShell } from "../panel-shell";

// The producer panel is private — keep it out of search indexes.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Shell for the whole producer panel: auth guard + org membership check run
 * once here (anti-enumeration: unknown/forbidden org → back to the resolver),
 * so child pages render only their content.
 */
export default async function PanelLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId: orgParam } = await params;
  const { userId } = await requireDashboardUser();
  const orgs = await getPlatformServices().identity.listMyOrganizations(userId);
  const current = orgs.find(
    (o) => o.organization.slug === orgParam || o.organization.id === orgParam,
  );

  const isPlatformAdmin = await currentUserIsPlatformAdmin();
  // Admin da plataforma entra no painel de QUALQUER org, mesmo sem membership
  // (a autorização dos serviços vem do OWNER sintético — lib/admin-membership).
  let org = current?.organization ?? null;
  if (!org && isPlatformAdmin) {
    const repo = getPlatformServices().organizations;
    org = (await repo.findBySlug(orgParam)) ?? (await repo.findById(orgParam));
  }
  if (!org) redirect("/painel");
  // Default do painel é DARK; o cookie só força light quando o usuário trocou.
  const theme = (await cookies()).get("panel_theme")?.value === "light" ? "light" : "dark";
  // Cor de marca do tenant (config da vitrine, gerida pelo admin) tinge o
  // painel inteiro; ausente → tokens padrão do tema.
  const brandColor = await getPlatformServices()
    .storefront.getPublicBrandColor(org.id)
    .catch(() => null);

  return (
    <PanelShell
      org={{
        slug: org.slug,
        name: org.name,
        niche: org.niche,
      }}
      multiOrg={orgs.length > 1 || !current}
      isPlatformAdmin={isPlatformAdmin}
      theme={theme}
      brandColor={brandColor}
    >
      {children}
    </PanelShell>
  );
}
