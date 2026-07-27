import type { Metadata } from "next";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { getServices } from "@/lib/services";
import { toEventResponse } from "@/lib/serializers";
import { PageHeader } from "@/components/ui";
import { OrdersSearch } from "./search-client";

export const metadata: Metadata = { title: "Pedidos — Ingressos" };

export default async function OrdersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);

  // Event list powers the per-event filter; failures degrade to an empty list.
  const events = (await getServices().events.listEvents(ctx).catch(() => [])).map(toEventResponse);

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Acompanhe e busque pedidos por código, cliente, evento ou status — e abra o histórico para agir."
      />
      <OrdersSearch orgId={orgId} events={events.map((e) => ({ id: e.id, title: e.title }))} />
    </>
  );
}
