import type { Metadata } from "next";
import { requireDashboardUser, resolveOrg } from "@/lib/dashboard";
import { PageHeader } from "@/components/ui";
import { OrgSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Configurações — Ingressos" };

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId: orgParam } = await params;
  const { userId } = await requireDashboardUser();
  const org = await resolveOrg(orgParam, userId);

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Preferências da organização: segmento do negócio e fuso horário padrão."
      />
      <div className="mt-6 max-w-xl">
        <OrgSettingsForm orgId={org.id} initialTimezone={org.timezone} initialNiche={org.niche} />
      </div>
    </>
  );
}
