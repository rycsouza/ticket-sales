import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser, resolveOrg } from "@/lib/dashboard";
import { toEventPageResponse, toEventResponse } from "@/lib/serializers";
import { PageEditor } from "./page-editor";

export const metadata: Metadata = { title: "Página do evento — Ingressos" };

export default async function EventPageCustomizer({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId: orgParam, eventId: eventParam } = await params;
  const { userId } = await requireDashboardUser();
  const org = await resolveOrg(orgParam, userId);
  const orgId = org.id;
  const ctx = dashboardCtx(orgId, userId);
  const services = await getTenantServices(org.id);

  let event;
  let page;
  try {
    event = toEventResponse(await services.events.getEventBySlugOrId(ctx, eventParam));
    page = toEventPageResponse(await services.eventPage.getPage(ctx, event.id));
  } catch {
    redirect(`/painel/${org.slug}`);
  }
  const eventId = event.id;

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

      <PageEditor
        orgId={orgId}
        eventId={eventId}
        previewHref={`/painel/${org.slug}/eventos/${event.slug}/preview`}
        initial={page}
      />
    </div>
  );
}
