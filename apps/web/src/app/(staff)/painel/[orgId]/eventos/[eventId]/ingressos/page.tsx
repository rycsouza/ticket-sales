import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Info, Lock, LockOpen, Ticket } from "lucide-react";
import { getTenantServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser, resolveOrg, orgVocabForParam } from "@/lib/dashboard";
import { flex, orgVocab } from "@/lib/org-vocab";
import { toBatchResponse, toEventResponse, toTicketTypeResponse } from "@/lib/serializers";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { BATCH_STATUS, fmtBRL, fmtDateTime, statusMeta } from "@/lib/status";
import { ActionButton } from "../../../../ui";
import {
  EditBatchButton,
  EditTicketTypeButton,
  NewBatchForm,
  NewTicketTypeForm,
} from "../inventory-forms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}): Promise<Metadata> {
  const { orgId: orgParam } = await params;
  const vocab = await orgVocabForParam(orgParam);
  return { title: `${vocab.ticketsAndBatches} — Ingressos` };
}

export default async function EventInventory({
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
  try {
    event = await services.events.getEventBySlugOrId(ctx, eventParam);
  } catch {
    redirect(`/painel/${org.slug}`);
  }
  const eventId = event.id;

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
          <h2 className="text-h2 text-ink">{vocab.ticketsAndBatches}</h2>
          <p className="mt-0.5 text-small text-ink-muted">
            Organize os produtos vendidos e seus períodos de venda.
          </p>
        </div>
        <NewTicketTypeForm orgId={orgId} eventId={eventId} vocab={vocab} />
      </div>

      <Alert tone="neutral" icon={<Info className="size-5" />}>
        <strong className="font-medium text-ink">{vocab.ticketType}</strong> define o produto
        (ex.: {vocab.ticket === "vaga" ? "Leito, Semi-leito, Poltrona" : "Pista, Camarote, Mesa"}).{" "}
        <strong className="font-medium text-ink">Lote</strong> define
        preço, quantidade e período de venda daquele tipo.
      </Alert>

      {ticketTypes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Ticket className="size-5" />}
            title={`Nenhum ${vocab.ticketType.toLowerCase()}`}
            description={`Crie o primeiro tipo de ${vocab.ticket} para depois montar os lotes.`}
            action={<NewTicketTypeForm orgId={orgId} eventId={eventId} vocab={vocab} />}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {ticketTypes.map((type) => {
            const typeBatches = batches.filter((b) => b.ticketTypeId === type.id);
            const sold = typeBatches.reduce((s, b) => s + b.quantitySold, 0);
            return (
              <Card key={type.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {type.name}
                      {!type.active && <Badge tone="neutral">Oculto</Badge>}
                    </span>
                  }
                  description={`${typeBatches.length} lote(s) · ${sold} ${flex("vendido", vocab.ticketGender)}(s)`}
                  action={
                    <span className="flex items-center gap-1">
                      <EditTicketTypeButton
                        vocab={vocab}
                        orgId={orgId}
                        eventId={eventId}
                        ticketType={{ id: type.id, name: type.name, active: type.active }}
                      />
                      <NewBatchForm
                        vocab={vocab}
                        orgId={orgId}
                        eventId={eventId}
                        ticketTypes={typeOptions}
                        lockedTicketTypeId={type.id}
                        triggerLabel="Criar lote"
                      />
                    </span>
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
                          className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink">{b.name}</span>
                              <Badge tone={bs.tone}>{bs.label}</Badge>
                            </div>
                            {/* Segmentos independentes: em 320px quebram um a um, sem linha órfã */}
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-small text-ink-muted">
                              <span className="tabular-nums text-ink-soft">{fmtBRL(b.priceCents)}</span>
                              <span className="tabular-nums">
                                {b.quantitySold}/{b.quantityTotal} {flex("vendidos", vocab.ticketGender)}
                              </span>
                              <span className="tabular-nums">{remaining} restantes</span>
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
                          <div className="flex shrink-0 items-center gap-1">
                            <EditBatchButton
                              orgId={orgId}
                              batch={{
                                id: b.id,
                                name: b.name,
                                priceCents: b.priceCents,
                                quantityTotal: b.quantityTotal,
                                maxPerOrder: b.maxPerOrder,
                                salesStartAt: b.salesStartAt ? b.salesStartAt.toISOString() : null,
                                salesEndAt: b.salesEndAt ? b.salesEndAt.toISOString() : null,
                              }}
                            />
                            {b.status === "OPEN" ? (
                              <ActionButton
                                url={batchApi(b.id)}
                                body={{ action: "close" }}
                                variant="secondary"
                                leftIcon={<Lock className="size-4" />}
                                confirmTitle="Encerrar vendas do lote?"
                                confirmLabel="Encerrar vendas"
                                confirmText={`As vendas do lote "${b.name}" serão encerradas. ${vocab.Tickets} já ${flex("vendidos", vocab.ticketGender)} continuam ${flex("válidos", vocab.ticketGender)} e você pode reabrir depois.`}
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
