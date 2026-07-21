import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toBatchResponse, toEventResponse } from "@/lib/serializers";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { NewEventForm } from "./event-forms";
import { EventsList, type EventListItem } from "./events-list";

export const metadata: Metadata = { title: "Eventos — Ingressos" };

export default async function OrgEvents({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);
  const services = getServices();

  const events = (await services.events.listEvents(ctx)).map(toEventResponse);

  // listEvents returns bare rows; enrich each with batch aggregates (parallel)
  // so the cards can show real sales progress. There is no cross-event
  // aggregate endpoint yet — see report for the suggested follow-up.
  const items: EventListItem[] = await Promise.all(
    events.map(async (e) => {
      const batches = await services.inventory
        .listSalesBatches(ctx, e.id)
        .then((r) => r.map(toBatchResponse))
        .catch(() => []);
      const soldQty = batches.reduce((s, b) => s + b.quantitySold, 0);
      const totalQty = batches.reduce((s, b) => s + b.quantityTotal, 0);
      const availableOpen = batches.filter(
        (b) => b.status === "OPEN" && b.quantitySold + b.quantityReserved < b.quantityTotal,
      ).length;
      return {
        id: e.id,
        title: e.title,
        slug: e.slug,
        status: e.status,
        startsAt: e.startsAt ? e.startsAt.toISOString() : null,
        location: [e.venueName, e.city, e.state].filter(Boolean).join(" · ") || null,
        soldQty,
        capacity: e.capacityTotal ?? (totalQty > 0 ? totalQty : null),
        availableOpen,
      } satisfies EventListItem;
    }),
  );

  return (
    <>
      <PageHeader
        title="Eventos"
        description="Crie e gerencie os eventos da sua produtora."
        actions={<NewEventForm orgId={orgId} />}
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="size-5" />}
            title="Nenhum evento ainda"
            description="Crie o primeiro evento para começar a montar lotes e vender ingressos."
            action={<NewEventForm orgId={orgId} />}
          />
        </Card>
      ) : (
        <EventsList orgId={orgId} events={items} />
      )}
    </>
  );
}
