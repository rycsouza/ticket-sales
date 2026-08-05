import type { Metadata } from "next";
import { dashboardCtx, requireDashboardUser, resolveOrg } from "@/lib/dashboard";
import { orgVocab } from "@/lib/org-vocab";
import { getTenantServices } from "@/lib/services";
import { toEventResponse } from "@/lib/serializers";
import { PageHeader } from "@/components/ui";
import { OrdersSearch } from "./search-client";

export const metadata: Metadata = { title: "Pedidos — Ingressos" };

export default async function OrdersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: orgParam } = await params;
  const { userId } = await requireDashboardUser();
  const org = await resolveOrg(orgParam, userId);
  const vocab = orgVocab(org.niche);
  const ctx = dashboardCtx(org.id, userId);

  // Event list powers the per-event filter; failures degrade to an empty list.
  const events = (await (await getTenantServices(org.id)).events.listEvents(ctx).catch(() => [])).map(toEventResponse);

  return (
    <>
      <PageHeader
        title="Pedidos"
        description={`Acompanhe e busque pedidos por código, cliente, ${vocab.event} ou status — e abra o histórico para agir.`}
      />
      <OrdersSearch
        vocab={vocab}
        orgId={org.id}
        orgSlug={org.slug}
        events={events.map((e) => ({ id: e.id, title: e.title }))}
      />
    </>
  );
}
