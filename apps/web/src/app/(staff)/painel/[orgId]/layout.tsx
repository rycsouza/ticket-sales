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
  if (!current) redirect("/painel");

  const isPlatformAdmin = await currentUserIsPlatformAdmin();
  const theme = (await cookies()).get("panel_theme")?.value === "dark" ? "dark" : "light";

  return (
    <PanelShell
      org={{
        slug: current.organization.slug,
        name: current.organization.name,
        niche: current.organization.niche,
      }}
      multiOrg={orgs.length > 1}
      isPlatformAdmin={isPlatformAdmin}
      theme={theme}
    >
      {children}
    </PanelShell>
  );
}
