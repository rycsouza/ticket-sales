import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  DollarSign,
  ExternalLink,
  Lock,
  LockOpen,
  PauseCircle,
  PlayCircle,
  Rocket,
  Users,
} from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toBatchResponse, toEventResponse, toTicketTypeResponse } from "@/lib/serializers";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { BATCH_STATUS, EVENT_STATUS, fmtBRL, statusMeta } from "@/lib/status";
import { ActionButton, CopyButton } from "../../../ui";
import { NewBatchForm, NewTicketTypeForm } from "./inventory-forms";

export const metadata: Metadata = { title: "Evento — Ingressos" };

export default async function EventWorkspace({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId, eventId } = await params;
  const { userId } = await requireDashboardUser();
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
  const statusUrl = `/api/orgs/${orgId}/events/${eventId}/status`;
  const status = statusMeta(EVENT_STATUS, event.status);
  const isDraft = event.status === "DRAFT";
  const isPublished = event.status === "PUBLISHED";
  const feePct = (event.platformFeeBps / 100).toString();

  return (
    <>
      <Link
        href={`/painel/${orgId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-small font-medium text-brand hover:underline"
      >
        <ArrowLeft className="size-4" />
        Eventos
      </Link>

      <PageHeader
        title={event.title}
        description={
          <span className="flex items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="text-ink-muted">
              Taxa {feePct}% ({event.feeMode === "BUYER" ? "comprador" : "produtora"})
            </span>
          </span>
        }
        actions={
          <>
            {isDraft && (
              <ActionButton url={statusUrl} body={{ action: "publish" }} leftIcon={<Rocket className="size-4" />}>
                Publicar
              </ActionButton>
            )}
            {isPublished && (
              <ActionButton
                url={statusUrl}
                body={{ action: "pause" }}
                variant="secondary"
                leftIcon={<PauseCircle className="size-4" />}
              >
                Pausar vendas
              </ActionButton>
            )}
            {event.status === "SALES_PAUSED" && (
              <ActionButton url={statusUrl} body={{ action: "resume" }} leftIcon={<PlayCircle className="size-4" />}>
                Retomar vendas
              </ActionButton>
            )}
          </>
        }
      />

      {/* Sub-navigation */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href={`${base}/promoters`}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-small font-medium text-ink-soft transition-colors hover:bg-hover"
        >
          <Users className="size-4" />
          Promoters & cupons
        </Link>
        <Link
          href={`${base}/financeiro`}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-small font-medium text-ink-soft transition-colors hover:bg-hover"
        >
          <DollarSign className="size-4" />
          Financeiro
        </Link>
      </div>

      {/* Public link */}
      {isPublished && (
        <Card className="mb-6">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-small font-medium text-ink">Link público de vendas</p>
              <Link
                href={`/e/${eventId}`}
                target="_blank"
                className="inline-flex items-center gap-1 truncate text-small text-brand hover:underline"
              >
                /e/{eventId}
                <ExternalLink className="size-3.5" />
              </Link>
            </div>
            <CopyButton text={`/e/${eventId}`} label="Copiar link" />
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ticket types */}
        <Card>
          <CardHeader
            title="Tipos de ingresso"
            action={<NewTicketTypeForm orgId={orgId} eventId={eventId} />}
          />
          {ticketTypes.length === 0 ? (
            <EmptyState title="Nenhum tipo ainda" description="Crie um tipo para montar os lotes." />
          ) : (
            <ul className="divide-y divide-line">
              {ticketTypes.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-3">
                  <span className="text-body font-medium text-ink">{t.name}</span>
                  <span className="text-small text-ink-muted">{t.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Batches */}
        <Card>
          <CardHeader
            title="Lotes"
            action={
              ticketTypes.length > 0 ? (
                <NewBatchForm orgId={orgId} eventId={eventId} ticketTypes={ticketTypes} />
              ) : undefined
            }
          />
          {batches.length === 0 ? (
            <EmptyState
              title="Nenhum lote ainda"
              description="Adicione um tipo de ingresso e crie o primeiro lote."
            />
          ) : (
            <ul className="divide-y divide-line">
              {batches.map((b) => {
                const bs = statusMeta(BATCH_STATUS, b.status);
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium text-ink">
                        {typeName.get(b.ticketTypeId) ?? "Ingresso"} — {b.name}
                      </span>
                      <span className="block truncate text-small text-ink-muted">
                        {fmtBRL(b.priceCents)} · {b.quantitySold}/{b.quantityTotal} vendidos
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge tone={bs.tone}>{bs.label}</Badge>
                      {b.status === "OPEN" ? (
                        <ActionButton
                          url={`/api/orgs/${orgId}/batches/${b.id}/status`}
                          body={{ action: "close" }}
                          variant="secondary"
                          leftIcon={<Lock className="size-4" />}
                        >
                          Fechar
                        </ActionButton>
                      ) : b.status === "SCHEDULED" || b.status === "CLOSED" ? (
                        <ActionButton
                          url={`/api/orgs/${orgId}/batches/${b.id}/status`}
                          body={{ action: "open" }}
                          leftIcon={<LockOpen className="size-4" />}
                        >
                          Abrir
                        </ActionButton>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
