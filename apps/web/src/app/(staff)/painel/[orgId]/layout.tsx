import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { requireDashboardUser } from "@/lib/dashboard";
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
  const { orgId } = await params;
  const { userId } = await requireDashboardUser();
  const orgs = await getServices().identity.listMyOrganizations(userId);
  const current = orgs.find((o) => o.organization.id === orgId);
  if (!current) redirect("/painel");

  return (
    <PanelShell
      org={{ id: orgId, name: current.organization.name }}
      multiOrg={orgs.length > 1}
    >
      {children}
    </PanelShell>
  );
}
