import type { Metadata } from "next";
import { dashboardCtx, requireDashboardUser, resolveOrg } from "@/lib/dashboard";
import { getServices } from "@/lib/services";
import { toBatchResponse, toEventResponse, toOfferResponse, toProductResponse } from "@/lib/serializers";
import { PageHeader } from "@/components/ui";
import { OffersManager } from "./offers-client";

export const metadata: Metadata = { title: "Ofertas — Ingressos" };

export default async function OffersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: orgParam } = await params;
  const { userId } = await requireDashboardUser();
  const org = await resolveOrg(orgParam, userId);
  const orgId = org.id;
  const ctx = dashboardCtx(orgId, userId);
  const services = getServices();

  const [products, offers, events] = await Promise.all([
    services.offers.listProducts(ctx).then((r) => r.map(toProductResponse)).catch(() => []),
    services.offers.listOffers(ctx).then((r) => r.map(toOfferResponse)).catch(() => []),
    services.events.listEvents(ctx).then((r) => r.map(toEventResponse)).catch(() => []),
  ]);

  // Batches per event feed the ticket-target picker (only OPEN lotes are useful).
  const eventBatches = await Promise.all(
    events.map(async (event) => ({
      id: event.id,
      title: event.title,
      batches: (await services.inventory.listSalesBatches(ctx, event.id).catch(() => []))
        .map(toBatchResponse)
        .map((b) => ({ id: b.id, name: b.name, priceCents: b.priceCents, status: b.status })),
    })),
  );

  return (
    <>
      <PageHeader
        title="Ofertas"
        description="Crie produtos e ofertas de upsell e order bump da organização e vincule aos eventos."
      />
      <OffersManager
        orgId={orgId}
        products={products}
        offers={offers}
        events={eventBatches}
      />
    </>
  );
}
