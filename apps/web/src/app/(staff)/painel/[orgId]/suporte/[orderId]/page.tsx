import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, StickyNote, Ticket } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
  TICKET_STATUS,
  fmtBRL,
  fmtDateTime,
  statusMeta,
} from "@/lib/status";
import { NoteForm, TicketActions } from "./console-client";

export const metadata: Metadata = { title: "Pedido — Suporte" };

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; orderId: string }>;
}) {
  const { orgId, orderId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);

  let timeline;
  try {
    timeline = await getServices().support.getOrderTimeline(ctx, orderId);
  } catch {
    notFound();
  }

  const { order, payments, tickets, events, notes } = timeline;
  const orderStatus = statusMeta(ORDER_STATUS, order.status);

  return (
    <>
      <Link
        href={`/painel/${orgId}/suporte`}
        className="mb-4 inline-flex items-center gap-1.5 text-small font-medium text-brand hover:underline"
      >
        <ArrowLeft className="size-4" />
        Voltar à busca
      </Link>

      <PageHeader
        title={order.buyerName}
        description={
          <span>
            Pedido <span className="font-mono">{order.code}</span>
          </span>
        }
        actions={<Badge tone={orderStatus.tone}>{orderStatus.label}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Buyer + totals */}
          <Card>
            <CardHeader title="Resumo do pedido" />
            <div className="grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-4">
              <Cell label="E-mail" value={order.buyerEmail} />
              <Cell label="Telefone" value={order.buyerPhone ?? "—"} />
              <Cell label="Documento" value={order.buyerDocument ?? "—"} />
              <Cell label="Pago em" value={fmtDateTime(order.paidAt)} />
              <Cell label="Subtotal" value={fmtBRL(order.subtotalCents)} />
              <Cell label="Desconto" value={fmtBRL(order.discountCents)} />
              <Cell label="Taxa" value={`${fmtBRL(order.feeCents)} · ${order.feeMode}`} />
              <Cell label="Total" value={fmtBRL(order.totalCents)} strong />
            </div>
          </Card>

          {/* Payments */}
          <Card>
            <CardHeader title="Pagamentos" />
            <CardBody>
              {payments.length === 0 ? (
                <p className="text-body text-ink-muted">Nenhum pagamento registrado.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {payments.map((p) => {
                    const ps = statusMeta(PAYMENT_STATUS, p.status);
                    return (
                      <li key={p.id} className="flex items-center justify-between py-2.5">
                        <span className="flex items-center gap-2 text-body text-ink">
                          {p.method}
                          <Badge tone={ps.tone}>{ps.label}</Badge>
                        </span>
                        <span className="text-body font-medium tabular-nums text-ink">
                          {fmtBRL(p.amountCents)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Tickets + actions */}
          <Card>
            <CardHeader title={`Ingressos (${tickets.length})`} />
            <ul className="divide-y divide-line">
              {tickets.map((t) => {
                const ts = statusMeta(TICKET_STATUS, t.status);
                return (
                  <li key={t.id} className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-hover text-ink-muted">
                          <Ticket className="size-5" strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-body font-medium text-ink">
                            {t.participantName ?? "Sem titular definido"}
                          </span>
                          <span className="block truncate text-small text-ink-muted">
                            {t.participantEmail ?? "—"}
                          </span>
                        </span>
                      </span>
                      <Badge tone={ts.tone}>{ts.label}</Badge>
                    </div>
                    <TicketActions orgId={orgId} ticketId={t.id} status={t.status} />
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        {/* Sidebar column: history + notes */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Histórico" />
            <CardBody>
              {events.length === 0 ? (
                <p className="text-small text-ink-muted">Sem eventos registrados.</p>
              ) : (
                <ol className="space-y-3">
                  {events.map((e) => (
                    <li key={e.id} className="flex gap-3">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
                      <span className="min-w-0">
                        <span className="block text-body font-medium text-ink">{e.action}</span>
                        <span className="block text-small text-ink-muted">
                          {fmtDateTime(e.createdAt)} · {e.actorType}
                          {e.justification ? ` · ${e.justification}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Notas internas"
              action={<StickyNote className="size-5 text-ink-faint" />}
            />
            <CardBody className="space-y-3">
              {notes.length > 0 && (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-lg border border-warning-border bg-warning-bg p-3"
                    >
                      <p className="whitespace-pre-wrap text-body text-ink">{n.body}</p>
                      <p className="mt-1 text-caption text-ink-muted">{fmtDateTime(n.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
              <NoteForm orgId={orgId} orderId={orderId} />
              <p className="text-small text-ink-muted">
                Visível apenas para a equipe; nunca para o comprador.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-surface p-3">
      <p className="text-caption text-ink-muted">{label}</p>
      <p
        className={
          strong
            ? "truncate text-body font-bold tabular-nums text-ink"
            : "truncate text-body text-ink"
        }
      >
        {value}
      </p>
    </div>
  );
}
