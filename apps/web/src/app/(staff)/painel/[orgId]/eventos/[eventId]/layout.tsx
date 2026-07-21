import type { ReactNode } from "react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toEventResponse } from "@/lib/serializers";
import { fmtDateTime } from "@/lib/status";
import { CopyButton } from "../../../ui";
import { EventStatusBadge, EventStatusControl } from "./event-workspace";
import { EventTabs } from "./event-tabs";

/**
 * Persistent workspace shell for a single event: fetched-once header (identity,
 * status, date/venue, public-page link, sales control) + section tabs. Every
 * child route renders only its own section content below this.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId, eventId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);

  let event;
  try {
    event = toEventResponse(await getServices().events.getEvent(ctx, eventId));
  } catch {
    redirect(`/painel/${orgId}`);
  }

  const base = `/painel/${orgId}/eventos/${eventId}`;
  const hasPublicPage = ["PUBLISHED", "SALES_PAUSED", "SALES_CLOSED"].includes(event.status);

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const publicUrl = `${proto}://${host}/evento/${event.slug}`;

  const location = [event.venueName, event.city, event.state].filter(Boolean).join(" · ");

  return (
    <>
      <Link
        href={`/painel/${orgId}`}
        className="mb-3 inline-flex items-center gap-1.5 text-small font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Voltar para eventos
      </Link>

      <header className="mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h1 text-ink">{event.title}</h1>
              <EventStatusBadge status={event.status} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4 shrink-0" />
                {event.startsAt ? fmtDateTime(event.startsAt) : "Data a definir"}
              </span>
              {location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 shrink-0" />
                  {location}
                </span>
              )}
            </div>
            {hasPublicPage && (
              <Link
                href={`/evento/${event.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-small font-medium text-brand hover:underline"
              >
                Visualizar página
                <ExternalLink className="size-3.5" />
              </Link>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {hasPublicPage && <CopyButton text={publicUrl} label="Copiar link" />}
            <EventStatusControl
              orgId={orgId}
              eventId={eventId}
              status={event.status}
              pageHref={`${base}/pagina`}
            />
          </div>
        </div>
      </header>

      <EventTabs base={base} />

      {children}
    </>
  );
}
