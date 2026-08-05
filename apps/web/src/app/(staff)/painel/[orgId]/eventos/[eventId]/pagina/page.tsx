import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser, resolveOrg, orgVocabForParam } from "@/lib/dashboard";
import { orgVocab, panelEventsBase } from "@/lib/org-vocab";
import { toEventPageResponse, toEventResponse } from "@/lib/serializers";
import { PageEditor } from "./page-editor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}): Promise<Metadata> {
  const { orgId: orgParam } = await params;
  const vocab = await orgVocabForParam(orgParam);
  return { title: `Página ${vocab.ofEvent} — Ingressos` };
}

export default async function EventPageCustomizer({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId: orgParam, eventId: eventParam } = await params;
  const { userId } = await requireDashboardUser();
  const org = await resolveOrg(orgParam, userId);
  const vocab = orgVocab(org.niche);
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
        <h2 className="text-h2 text-ink">Página {vocab.ofEvent}</h2>
        <p className="mt-0.5 text-small text-ink-muted">
          {isPublished
            ? "As alterações vão ao ar assim que você salvar."
            : `A página fica visível ao público após publicar ${vocab.theEvent}.`}
        </p>
      </div>

      <PageEditor
        vocab={vocab}
        orgId={orgId}
        eventId={eventId}
        previewHref={`${panelEventsBase(org.slug, vocab)}/${event.slug}/preview`}
        initial={page}
      />
    </div>
  );
}
