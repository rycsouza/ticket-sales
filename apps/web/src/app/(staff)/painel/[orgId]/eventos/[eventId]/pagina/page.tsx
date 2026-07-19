import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toEventPageResponse, toEventResponse } from "@/lib/serializers";
import { PageHeader } from "@/components/ui";
import { PageEditor } from "./page-editor";

export const metadata: Metadata = { title: "Personalizar página — Ingressos" };

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

  const isPublished = event.status === "PUBLISHED";

  return (
    <>
      <Link
        href={`/painel/${orgId}/eventos/${eventId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-small font-medium text-brand hover:underline"
      >
        <ArrowLeft className="size-4" />
        {event.title}
      </Link>

      <PageHeader
        title="Personalizar página"
        description={
          isPublished ? (
            <Link
              href={`/evento/${event.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-small text-brand hover:underline"
            >
              Ver página publicada
              <ExternalLink className="size-3.5" />
            </Link>
          ) : (
            <span className="text-ink-muted">
              A página fica visível ao público após publicar o evento.
            </span>
          )
        }
      />

      <PageEditor orgId={orgId} eventId={eventId} initial={page} />
    </>
  );
}
