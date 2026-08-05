import type { Metadata } from "next";
import { requireDashboardUser, resolveOrg } from "@/lib/dashboard";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { PageHeader } from "@/components/ui";
import { OrgSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Configurações" };

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId: orgParam } = await params;
  // Superfície de ADMIN DA PLATAFORMA (allowlist) — usuário comum vê 404.
  await requirePlatformAdmin();
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
