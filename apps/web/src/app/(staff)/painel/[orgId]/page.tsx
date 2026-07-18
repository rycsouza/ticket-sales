import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toEventResponse } from "@/lib/serializers";
import { DashboardHeader } from "../header";
import { NewEventForm } from "./event-forms";

export const metadata: Metadata = { title: "Eventos — Ingressos" };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  SALES_PAUSED: "Vendas pausadas",
  SALES_CLOSED: "Vendas encerradas",
  POSTPONED: "Adiado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
  ARCHIVED: "Arquivado",
};

export default async function OrgEvents({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { userId } = await requireDashboardUser();
  const orgs = await getServices().identity.listMyOrganizations(userId);
  const org = orgs.find((o) => o.organization.id === orgId);
  if (!org) redirect("/painel");

  const ctx = dashboardCtx(orgId, userId);
  const events = (await getServices().events.listEvents(ctx)).map(toEventResponse);

  return (
    <div className="mx-auto max-w-2xl">
      <DashboardHeader orgName={org.organization.name} orgId={orgId} />
      <main className="space-y-6 p-4">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Eventos</h2>
          {events.length === 0 ? (
            <p className="text-sm text-ink-400">Nenhum evento ainda. Crie o primeiro abaixo.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/painel/${orgId}/eventos/${e.id}`}
                    className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm active:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{e.title}</span>
                      <span className="text-xs text-ink-400">/{e.slug}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-600">
                      {STATUS_LABEL[e.status] ?? e.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <NewEventForm orgId={orgId} />
      </main>
    </div>
  );
}
