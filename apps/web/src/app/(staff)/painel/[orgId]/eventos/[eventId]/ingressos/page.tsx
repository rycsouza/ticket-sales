import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Info, Lock, LockOpen, Ticket } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toBatchResponse, toEventResponse, toTicketTypeResponse } from "@/lib/serializers";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import {
  BATCH_STATUS,
  fmtBRL,
  fmtDateTime,
  statusMeta,
  TICKET_KIND,
  ticketKindLabel,
} from "@/lib/status";
import { ActionButton } from "../../../../ui";
import { NewBatchForm, NewTicketTypeForm } from "../inventory-forms";

export const metadata: Metadata = { title: "Ingressos e lotes — Ingressos" };

export default async function EventInventory({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId, eventId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);
  const services = getServices();

  try {
    await services.events.getEvent(ctx, eventId);
  } catch {
    redirect(`/painel/${orgId}`);
  }

  const [ticketTypes, batches] = await Promise.all([
    services.inventory.listTicketTypes(ctx, eventId).then((r) => r.map(toTicketTypeResponse)),
    services.inventory.listSalesBatches(ctx, eventId).then((r) => r.map(toBatchResponse)),
  ]);

  const typeOptions = ticketTypes.map((t) => ({ id: t.id, name: t.name }));
  const batchApi = (batchId: string) => `/api/orgs/${orgId}/batches/${batchId}/status`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-h2 text-ink">Ingressos e lotes</h2>
          <p className="mt-0.5 text-small text-ink-muted">
            Organize os produtos vendidos e seus períodos de venda.
          </p>
        </div>
        <NewTicketTypeForm orgId={orgId} eventId={eventId} />
      </div>

      <Alert tone="neutral" icon={<Info className="size-5" />}>
        <strong className="font-medium text-ink">Tipo de ingresso</strong> define o produto
        (ex.: Pista, Camarote, Mesa). <strong className="font-medium text-ink">Lote</strong> define
        preço, quantidade e período de venda daquele tipo.
      </Alert>

      {ticketTypes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Ticket className="size-5" />}
            title="Nenhum tipo de ingresso"
            description="Crie o primeiro tipo de ingresso para depois montar os lotes."
            action={<NewTicketTypeForm orgId={orgId} eventId={eventId} />}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {ticketTypes.map((type) => {
            const typeBatches = batches.filter((b) => b.ticketTypeId === type.id);
            const sold = typeBatches.reduce((s, b) => s + b.quantitySold, 0);
            const kindMeta = statusMeta(TICKET_KIND, type.kind);
            return (
              <Card key={type.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {type.name}
                      <Badge tone={kindMeta.tone}>{ticketKindLabel(type.kind)}</Badge>
                      {!type.active && <Badge tone="neutral">Oculto</Badge>}
                    </span>
                  }
                  description={`${typeBatches.length} lote(s) · ${sold} vendido(s)`}
                  action={
                    <NewBatchForm
                      orgId={orgId}
                      eventId={eventId}
                      ticketTypes={typeOptions}
                      lockedTicketTypeId={type.id}
                      triggerLabel="Criar lote"
                    />
                  }
                />
                {typeBatches.length === 0 ? (
                  <CardBody>
                    <p className="text-small text-ink-muted">
                      Nenhum lote para este tipo ainda. Crie o primeiro lote para começar a vender.
                    </p>
                  </CardBody>
                ) : (
                  <ul className="divide-y divide-line">
                    {typeBatches.map((b) => {
                      const bs = statusMeta(BATCH_STATUS, b.status);
                      const remaining = b.quantityTotal - b.quantitySold - b.quantityReserved;
                      return (
                        <li
                          key={b.id}
                          className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink">{b.name}</span>
                              <Badge tone={bs.tone}>{bs.label}</Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-small text-ink-muted">
                              <span className="tabular-nums text-ink-soft">{fmtBRL(b.priceCents)}</span>
                              <span className="tabular-nums">
                                {b.quantitySold}/{b.quantityTotal} vendidos · {remaining} restantes
                              </span>
                              {b.maxPerOrder != null && <span>Limite {b.maxPerOrder}/pedido</span>}
                            </div>
                            {(b.salesStartAt || b.salesEndAt) && (
                              <p className="mt-0.5 text-caption text-ink-faint">
                                {b.salesStartAt ? `Abre ${fmtDateTime(b.salesStartAt)}` : ""}
                                {b.salesStartAt && b.salesEndAt ? " · " : ""}
                                {b.salesEndAt ? `Encerra ${fmtDateTime(b.salesEndAt)}` : ""}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0">
                            {b.status === "OPEN" ? (
                              <ActionButton
                                url={batchApi(b.id)}
                                body={{ action: "close" }}
                                variant="secondary"
                                leftIcon={<Lock className="size-4" />}
                                confirmTitle="Encerrar vendas do lote?"
                                confirmLabel="Encerrar vendas"
                                confirmText={`As vendas do lote "${b.name}" serão encerradas. Ingressos já vendidos continuam válidos e você pode reabrir depois.`}
                              >
                                Encerrar vendas
                              </ActionButton>
                            ) : b.status === "SCHEDULED" || b.status === "CLOSED" ? (
                              <ActionButton
                                url={batchApi(b.id)}
                                body={{ action: "open" }}
                                leftIcon={<LockOpen className="size-4" />}
                              >
                                Abrir vendas
                              </ActionButton>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
