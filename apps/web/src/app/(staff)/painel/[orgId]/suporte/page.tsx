import type { Metadata } from "next";
import { requireDashboardUser } from "@/lib/dashboard";
import { PageHeader } from "@/components/ui";
import { SupportSearch } from "./search-client";

export const metadata: Metadata = { title: "Suporte — Ingressos" };

export default async function SupportPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  // Layout already guarded auth + org membership; touch the session so the page
  // stays dynamic (never statically cached with another user's context).
  await requireDashboardUser();

  return (
    <>
      <PageHeader
        title="Suporte"
        description="Busque um pedido por código, e-mail, nome ou documento para ver o histórico e agir."
      />
      <SupportSearch orgId={orgId} />
    </>
  );
}
