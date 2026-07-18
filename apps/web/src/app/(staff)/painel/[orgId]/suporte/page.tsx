import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { requireDashboardUser } from "@/lib/dashboard";
import { DashboardHeader } from "../../header";
import { SupportSearch } from "./search-client";

export const metadata: Metadata = { title: "Suporte — Ingressos" };

export default async function SupportPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { userId } = await requireDashboardUser();
  const orgs = await getServices().identity.listMyOrganizations(userId);
  const org = orgs.find((o) => o.organization.id === orgId);
  if (!org) redirect("/painel");

  return (
    <div className="mx-auto max-w-2xl">
      <DashboardHeader orgName={org.organization.name} orgId={orgId} />
      <main className="space-y-6 p-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Suporte</h1>
          <p className="text-sm text-ink-400">
            Busque um pedido por código, e-mail, nome ou documento para ver o histórico e agir.
          </p>
        </div>
        <SupportSearch orgId={orgId} />
      </main>
    </div>
  );
}
