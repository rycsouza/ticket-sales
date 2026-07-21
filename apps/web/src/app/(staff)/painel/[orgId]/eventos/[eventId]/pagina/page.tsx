import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toEventPageResponse, toEventResponse } from "@/lib/serializers";
import { PageEditor } from "./page-editor";

export const metadata: Metadata = { title: "Página do evento — Ingressos" };

export default async function EventPageCustomizer({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId, eventId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);
  const services = getServices();

  let event;
  let page;
  try {
    event = toEventResponse(await services.events.getEvent(ctx, eventId));
    page = toEventPageResponse(await services.eventPage.getPage(ctx, eventId));
  } catch {
    redirect(`/painel/${orgId}`);
  }

  const isPublished = ["PUBLISHED", "SALES_PAUSED", "SALES_CLOSED"].includes(event.status);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-h2 text-ink">Página do evento</h2>
        <p className="mt-0.5 text-small text-ink-muted">
          {isPublished
            ? "As alterações vão ao ar assim que você salvar."
            : "A página fica visível ao público após publicar o evento."}
        </p>
      </div>

      <PageEditor orgId={orgId} eventId={eventId} initial={page} />
    </div>
  );
}
