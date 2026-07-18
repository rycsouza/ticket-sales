import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toEventResponse } from "@/lib/serializers";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { EVENT_STATUS, statusMeta } from "@/lib/status";
import { NewEventForm } from "./event-forms";

export const metadata: Metadata = { title: "Eventos — Ingressos" };

export default async function OrgEvents({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);
  const events = (await getServices().events.listEvents(ctx)).map(toEventResponse);

  return (
    <>
      <PageHeader
        title="Eventos"
        description="Crie e gerencie os eventos da sua produtora."
        actions={<NewEventForm orgId={orgId} />}
      />

      {events.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="size-5" />}
            title="Nenhum evento ainda"
            description="Crie o primeiro evento para começar a montar lotes e vender ingressos."
          />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {events.map((e) => {
            const s = statusMeta(EVENT_STATUS, e.status);
            return (
              <li key={e.id}>
                <Link
                  href={`/painel/${orgId}/eventos/${e.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-hover"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{e.title}</span>
                    <span className="block truncate text-small text-ink-muted">/{e.slug}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    <ChevronRight className="size-4 text-ink-faint" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
