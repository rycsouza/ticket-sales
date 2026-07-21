import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, MessageCircle } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toEventResponse, toOrderSearchRowResponse } from "@/lib/serializers";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Stat, buttonVariants } from "@/components/ui";
import { ORDER_STATUS, fmtBRL, fmtDate, fmtDateTime, statusMeta } from "@/lib/status";
import { pluralize, whatsappUrl } from "@/lib/format";
import { CommunicationButton } from "./detail-client";

export const metadata: Metadata = { title: "Comprador — Ingressos" };

export default async function BuyerDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; email: string }>;
}) {
  const { orgId, email: emailParam } = await params;
  const email = decodeURIComponent(emailParam).toLowerCase();
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);
  const services = getServices();
  const backHref = `/painel/${orgId}/compradores`;

  let segment;
  try {
    segment = await services.customers.getSegment(ctx, { includeOptedOut: true });
  } catch {
    redirect(backHref);
  }

  const buyer = segment.customers.find((c) => c.email.toLowerCase() === email);
  if (!buyer) {
    return (
      <>
        <BackLink href={backHref} />
        <Card>
          <EmptyState
            title="Comprador não encontrado"
            description="Este comprador não está mais na base ou o endereço está incorreto."
          />
        </Card>
      </>
    );
  }

  const [events, ordersResult] = await Promise.all([
    services.events.listEvents(ctx).then((r) => r.map(toEventResponse)).catch(() => []),
    services.support
      .searchOrders(ctx, { q: email, limit: 50 })
      .then((r) => ({ ok: true as const, rows: r.map(toOrderSearchRowResponse) }))
      .catch(() => ({ ok: false as const, rows: [] })),
  ]);
  const eventTitle = new Map(events.map((e) => [e.id, e.title]));
  // `q` is a substring match — keep only this buyer's orders.
  const orders = ordersResult.rows.filter((o) => o.buyerEmail.toLowerCase() === email);

  const avgTicket = buyer.orderCount > 0 ? Math.round(buyer.totalSpentCents / buyer.orderCount) : 0;
  const wa = whatsappUrl(buyer.phone);

  return (
    <>
      <BackLink href={backHref} />

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-h1 text-ink">{buyer.name ?? buyer.email}</h1>
          <p className="mt-1 break-all text-body text-ink-muted">{buyer.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {buyer.optedOut ? (
              <Badge tone="neutral">
                <span aria-hidden className="size-1.5 rounded-full bg-ink-faint" />
                Comunicações desativadas
              </Badge>
            ) : (
              <Badge tone="success">
                <span aria-hidden className="size-1.5 rounded-full bg-success" />
                Comunicações ativas
              </Badge>
            )}
            {buyer.phone && <span className="text-small text-ink-muted">{buyer.phone}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {wa && !buyer.optedOut && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <MessageCircle className="size-4 text-success" />
              WhatsApp
            </a>
          )}
          <CommunicationButton orgId={orgId} email={buyer.email} optedOut={buyer.optedOut} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pedidos pagos" value={buyer.orderCount.toLocaleString("pt-BR")} />
        <Stat label="Total comprado" value={fmtBRL(buyer.totalSpentCents)} />
        <Stat label="Ticket médio" value={buyer.orderCount > 0 ? fmtBRL(avgTicket) : "—"} />
        <Stat
          label="Última compra"
          value={buyer.lastPurchaseAt ? fmtDate(buyer.lastPurchaseAt) : "—"}
        />
      </div>

      <Card>
        <CardHeader
          title="Histórico de pedidos"
          description={
            orders.length > 0
              ? pluralize(orders.length, "pedido encontrado", "pedidos encontrados")
              : undefined
          }
        />
        {!ordersResult.ok ? (
          <CardBody>
            <Alert tone="neutral">
              Não foi possível carregar os pedidos deste comprador com o seu nível de acesso.
            </Alert>
          </CardBody>
        ) : orders.length === 0 ? (
          <CardBody>
            <p className="text-small text-ink-muted">Nenhum pedido encontrado para este comprador.</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-body">
              <thead>
                <tr className="border-b border-line text-left text-small text-ink-muted">
                  <th scope="col" className="px-5 py-2.5 font-medium">Pedido</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Evento</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Data</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Situação</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => {
                  const s = statusMeta(ORDER_STATUS, o.status);
                  return (
                    <tr key={o.id} className="hover:bg-hover">
                      <td className="px-5 py-3">
                        <Link
                          href={`/painel/${orgId}/suporte/${o.id}`}
                          className="inline-flex items-center gap-1 font-mono font-medium text-brand hover:underline"
                        >
                          {o.code}
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-ink-soft">{eventTitle.get(o.eventId) ?? "—"}</td>
                      <td className="px-5 py-3 text-ink-soft" title={fmtDateTime(o.createdAt)}>
                        {fmtDate(o.createdAt)}
                      </td>
                      <td className="px-5 py-3"><Badge tone={s.tone}>{s.label}</Badge></td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink">{fmtBRL(o.totalCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-small text-ink-muted">
        A busca de pedidos retorna até 50 registros mais recentes.
      </p>
    </>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 text-small font-medium text-ink-muted transition-colors hover:text-ink"
    >
      <ArrowLeft className="size-4" />
      Voltar para compradores
    </Link>
  );
}
