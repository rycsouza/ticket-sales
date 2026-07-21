import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Percent, Ticket, TrendingUp, Users, Wallet } from "lucide-react";
import type { EventFinancialSummary } from "@ingressos/core";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toBatchResponse, toEventResponse } from "@/lib/serializers";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { EVENT_STATUS, fmtBRL, statusMeta } from "@/lib/status";
import { EventFilterSelect } from "../../ui";

export const metadata: Metadata = { title: "Relatório — Ingressos" };

export default async function OrgReport({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ evento?: string }>;
}) {
  const { orgId } = await params;
  const { evento } = await searchParams;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);
  const services = getServices();

  const events = (await services.events.listEvents(ctx).catch(() => [])).map(toEventResponse);
  const eventId = evento && events.some((e) => e.id === evento) ? evento : undefined;
  const scoped = eventId ? events.filter((e) => e.id === eventId) : events;

  // No cross-event aggregate endpoint exists — fold per-event finance (role
  // gated; null when not permitted) + batch sold counts. See report follow-up.
  const rows = await Promise.all(
    scoped.map(async (event) => {
      const [batches, finance] = await Promise.all([
        services.inventory
          .listSalesBatches(ctx, event.id)
          .then((r) => r.map(toBatchResponse))
          .catch(() => []),
        services.finance
          .getEventFinancialSummary(ctx, event.id)
          .catch((): EventFinancialSummary | null => null),
      ]);
      const sold = batches.reduce((s, b) => s + b.quantitySold, 0);
      return { event, sold, finance };
    }),
  );
  rows.sort((a, b) => (b.finance?.grossSalesCents ?? 0) - (a.finance?.grossSalesCents ?? 0) || b.sold - a.sold);

  const financeAvailable = rows.some((r) => r.finance !== null);
  const totals = rows.reduce(
    (acc, r) => ({
      sold: acc.sold + r.sold,
      gross: acc.gross + (r.finance?.grossSalesCents ?? 0),
      payable: acc.payable + (r.finance?.producerPayableCents ?? 0),
      commissions: acc.commissions + (r.finance?.promoterPayableCents ?? 0),
    }),
    { sold: 0, gross: 0, payable: 0, commissions: 0 },
  );

  return (
    <>
      <PageHeader
        title="Relatório"
        description="Visão consolidada de vendas e financeiro da produtora."
      />

      {events.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="size-5" />}
            title="Nenhum evento ainda"
            description="Crie eventos e faça vendas para ver os números aqui."
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 sm:max-w-xs">
            <EventFilterSelect
              basePath={`/painel/${orgId}/relatorio`}
              events={events.map((e) => ({ id: e.id, title: e.title }))}
              selected={eventId ?? ""}
              ariaLabel="Filtrar relatório por evento"
            />
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Eventos"
              value={scoped.length.toLocaleString("pt-BR")}
              icon={<CalendarDays className="size-4" />}
            />
            <Stat
              label="Ingressos vendidos"
              value={totals.sold.toLocaleString("pt-BR")}
              icon={<Ticket className="size-4" />}
            />
            {financeAvailable ? (
              <>
                <Stat
                  label="Receita bruta"
                  value={fmtBRL(totals.gross)}
                  icon={<TrendingUp className="size-4" />}
                />
                <Stat
                  label="Saldo a receber"
                  value={fmtBRL(totals.payable)}
                  hint={`Comissões a pagar: ${fmtBRL(totals.commissions)}`}
                  icon={<Wallet className="size-4" />}
                />
              </>
            ) : (
              <Stat
                label="Pessoas alcançadas"
                value="—"
                hint="Financeiro indisponível para o seu perfil"
                icon={<Users className="size-4" />}
              />
            )}
          </div>

          <Card>
            <CardHeader
              title="Desempenho por evento"
              description={financeAvailable ? undefined : "Receita visível apenas para perfis com acesso ao financeiro."}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-body">
                <thead>
                  <tr className="border-b border-line text-left text-small text-ink-muted">
                    <th className="px-5 py-2.5 font-medium">Evento</th>
                    <th className="px-5 py-2.5 font-medium">Situação</th>
                    <th className="px-5 py-2.5 text-right font-medium">Vendidos</th>
                    <th className="px-5 py-2.5 text-right font-medium">Receita bruta</th>
                    <th className="px-5 py-2.5 text-right font-medium">Saldo a receber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map(({ event, sold, finance }) => {
                    const s = statusMeta(EVENT_STATUS, event.status);
                    return (
                      <tr key={event.id} className="hover:bg-hover">
                        <td className="px-5 py-3">
                          <Link
                            href={`/painel/${orgId}/eventos/${event.id}`}
                            className="font-medium text-ink hover:text-brand hover:underline"
                          >
                            {event.title}
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={s.tone}>{s.label}</Badge>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">{sold.toLocaleString("pt-BR")}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
                          {finance ? fmtBRL(finance.grossSalesCents) : "—"}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
                          {finance ? fmtBRL(finance.producerPayableCents) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Alert tone="neutral" className="mt-4">
            Os números refletem os pedidos pagos registrados. O detalhamento completo de cada evento
            está em <strong className="font-medium text-ink">Financeiro</strong>, dentro do evento.
          </Alert>
        </>
      )}
    </>
  );
}
