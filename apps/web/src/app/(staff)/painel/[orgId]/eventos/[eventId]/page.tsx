import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toBatchResponse, toEventResponse, toTicketTypeResponse } from "@/lib/serializers";
import { DashboardHeader } from "../../../header";
import { ActionButton, CopyButton } from "../../../ui";
import { NewBatchForm, NewTicketTypeForm } from "./inventory-forms";

export const metadata: Metadata = { title: "Evento — Ingressos" };

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function EventWorkspace({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId, eventId } = await params;
  const { userId } = await requireDashboardUser();
  const orgs = await getServices().identity.listMyOrganizations(userId);
  const org = orgs.find((o) => o.organization.id === orgId);
  if (!org) redirect("/painel");

  const ctx = dashboardCtx(orgId, userId);
  const services = getServices();
  let event;
  try {
    event = toEventResponse(await services.events.getEvent(ctx, eventId));
  } catch {
    redirect(`/painel/${orgId}`);
  }
  const [ticketTypes, batches] = await Promise.all([
    services.inventory.listTicketTypes(ctx, eventId).then((r) => r.map(toTicketTypeResponse)),
    services.inventory.listSalesBatches(ctx, eventId).then((r) => r.map(toBatchResponse)),
  ]);
  const typeName = new Map(ticketTypes.map((t) => [t.id, t.name]));

  const base = `/painel/${orgId}/eventos/${eventId}`;
  const isDraft = event.status === "DRAFT";
  const isPublished = event.status === "PUBLISHED";

  return (
    <div className="mx-auto max-w-2xl">
      <DashboardHeader orgName={org.organization.name} orgId={orgId} />
      <main className="space-y-6 p-4">
        <div>
          <Link href={`/painel/${orgId}`} className="text-sm text-brand-600">
            ← Eventos
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">{event.title}</h1>
          <p className="text-sm text-ink-400">
            {event.status} · taxa {(event.platformFeeBps / 100).toString()}% (
            {event.feeMode === "BUYER" ? "comprador" : "produtora"})
          </p>
        </div>

        {/* Sub-navigation to the other workspaces */}
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link href={`${base}/promoters`} className="rounded-lg bg-white px-3 py-2 font-medium shadow-sm">
            Promoters & cupons
          </Link>
          <Link href={`${base}/financeiro`} className="rounded-lg bg-white px-3 py-2 font-medium shadow-sm">
            Financeiro
          </Link>
          <Link href="/checkin" className="rounded-lg bg-white px-3 py-2 font-medium shadow-sm">
            Portaria
          </Link>
        </nav>

        {/* Lifecycle */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">
            Situação
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {isDraft && (
              <ActionButton url={`/api/orgs/${orgId}/events/${eventId}/status`} body={{ action: "publish" }}>
                Publicar
              </ActionButton>
            )}
            {isPublished && (
              <ActionButton url={`/api/orgs/${orgId}/events/${eventId}/status`} body={{ action: "pause" }} variant="secondary">
                Pausar vendas
              </ActionButton>
            )}
            {event.status === "SALES_PAUSED" && (
              <ActionButton url={`/api/orgs/${orgId}/events/${eventId}/status`} body={{ action: "resume" }}>
                Retomar vendas
              </ActionButton>
            )}
          </div>
          {isPublished && (
            <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
              <Link href={`/e/${eventId}`} className="truncate text-sm text-brand-600" target="_blank">
                /e/{eventId}
              </Link>
              <CopyButton text={`/e/${eventId}`} label="Copiar link" />
            </div>
          )}
        </section>

        {/* Ticket types */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">
            Tipos de ingresso
          </h2>
          {ticketTypes.length === 0 ? (
            <p className="text-sm text-ink-400">Nenhum tipo ainda.</p>
          ) : (
            <ul className="mb-3 divide-y divide-slate-100">
              {ticketTypes.map((t) => (
                <li key={t.id} className="flex justify-between py-2 text-sm">
                  <span>{t.name}</span>
                  <span className="text-ink-400">{t.kind}</span>
                </li>
              ))}
            </ul>
          )}
          <NewTicketTypeForm orgId={orgId} eventId={eventId} />
        </section>

        {/* Batches */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">
            Lotes
          </h2>
          {batches.length === 0 ? (
            <p className="text-sm text-ink-400">Nenhum lote ainda.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {batches.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {typeName.get(b.ticketTypeId) ?? "Ingresso"} — {b.name}
                    </span>
                    <span className="text-xs text-ink-400">
                      {brl(b.priceCents)} · {b.quantitySold}/{b.quantityTotal} vendidos · {b.status}
                    </span>
                  </span>
                  {b.status === "OPEN" ? (
                    <ActionButton url={`/api/orgs/${orgId}/batches/${b.id}/status`} body={{ action: "close" }} variant="secondary">
                      Fechar
                    </ActionButton>
                  ) : b.status === "SCHEDULED" || b.status === "CLOSED" ? (
                    <ActionButton url={`/api/orgs/${orgId}/batches/${b.id}/status`} body={{ action: "open" }}>
                      Abrir
                    </ActionButton>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {ticketTypes.length > 0 && (
            <NewBatchForm orgId={orgId} eventId={eventId} ticketTypes={ticketTypes} />
          )}
        </section>
      </main>
    </div>
  );
}
