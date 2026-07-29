import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Download, Ticket, TrendingUp, Users, Wallet } from "lucide-react";
import type { EventFinancialSummary } from "@ingressos/core";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser, resolveOrg } from "@/lib/dashboard";
import { toBatchResponse, toEventResponse, toPromoterResponse } from "@/lib/serializers";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
  buttonVariants,
} from "@/components/ui";
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
  const { orgId: orgParam } = await params;
  const { evento } = await searchParams;
  const { userId } = await requireDashboardUser();
  const org = await resolveOrg(orgParam, userId);
  const orgId = org.id;
  const orgSlug = org.slug;
  const ctx = dashboardCtx(orgId, userId);
  const services = getServices();

  const events = (await services.events.listEvents(ctx).catch(() => [])).map(toEventResponse);
  const eventId = evento && events.some((e) => e.id === evento) ? evento : undefined;
  const scoped = eventId ? events.filter((e) => e.id === eventId) : events;
  const scopedEventSlug = eventId ? (scoped[0]?.slug ?? eventId) : eventId;

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

  // When a single event is selected, surface its full financial breakdown here
  // so the producer never has to open the event to read the report. The event's
  // own Financeiro tab keeps only the operational actions (registering payouts).
  const selected = eventId ? rows.find((r) => r.event.id === eventId) : undefined;
  const selectedFinance = selected?.finance ?? null;
  const commissions =
    eventId && selectedFinance
      ? await (async () => {
          const [payables, promoters] = await Promise.all([
            services.finance.getEventPromoterPayables(ctx, eventId).catch(() => []),
            services.promoters
              .listPromoters(ctx)
              .then((r) => r.map(toPromoterResponse))
              .catch(() => []),
          ]);
          return payables.map((p) => ({
            promoterId: p.promoterId,
            name: promoters.find((x) => x.id === p.promoterId)?.name ?? "Promotor",
            owedCents: p.owedCents,
          }));
        })()
      : [];

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
              basePath={`/painel/${orgSlug}/relatorio`}
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
            {/* Mobile: linhas viram cards (sem scroll horizontal) */}
            <ul className="divide-y divide-line md:hidden">
              {rows.map(({ event, sold, finance }) => {
                const s = statusMeta(EVENT_STATUS, event.status);
                return (
                  <li key={event.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/painel/${orgSlug}/eventos/${event.slug}`}
                        className="min-w-0 truncate font-medium text-ink hover:text-brand hover:underline"
                      >
                        {event.title}
                      </Link>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </div>
                    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small">
                      <div>
                        <dt className="text-ink-muted">Vendidos</dt>
                        <dd className="tabular-nums font-medium text-ink">
                          {sold.toLocaleString("pt-BR")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink-muted">Receita bruta</dt>
                        <dd className="tabular-nums font-medium text-ink">
                          {finance ? fmtBRL(finance.grossSalesCents) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink-muted">Saldo a receber</dt>
                        <dd className="tabular-nums font-medium text-ink">
                          {finance ? fmtBRL(finance.producerPayableCents) : "—"}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: tabela original */}
            <div className="hidden overflow-x-auto md:block">
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
                            href={`/painel/${orgSlug}/eventos/${event.slug}`}
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

          {eventId && selectedFinance ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Composição do resultado"
                  description={`Detalhamento de ${selected?.event.title ?? "evento"} — do total vendido ao saldo a receber.`}
                  action={
                    <a
                      href={`/api/orgs/${orgId}/events/${eventId}/finance/export`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Download className="size-4" />
                      Extrato (CSV)
                    </a>
                  }
                />
                <CardBody>
                  <ul className="divide-y divide-line">
                    {(
                      [
                        { label: "Vendas brutas", value: selectedFinance.grossSalesCents },
                        { label: "Descontos", value: -selectedFinance.discountCents },
                        { label: "Taxas da plataforma", value: -selectedFinance.platformFeeCents },
                        { label: "Custos de pagamento", value: -selectedFinance.pspCostCents },
                        { label: "Comissões", value: -selectedFinance.commissionCents },
                        { label: "Reembolsos", value: -selectedFinance.refundedCents },
                        { label: "Repasses já registrados", value: -selectedFinance.payoutsCents },
                      ] as const
                    ).map((row) => (
                      <li
                        key={row.label}
                        className="flex items-center justify-between gap-3 py-2.5 text-body"
                      >
                        <span className="text-ink-soft">{row.label}</span>
                        <span
                          className={
                            row.value < 0 ? "tabular-nums text-ink-muted" : "tabular-nums text-ink"
                          }
                        >
                          {row.value < 0
                            ? `− ${fmtBRL(Math.abs(row.value))}`
                            : fmtBRL(row.value)}
                        </span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between gap-3 pt-3 text-body font-semibold">
                      <span className="text-ink">Saldo a receber</span>
                      <span className="tabular-nums text-ink">
                        {fmtBRL(selectedFinance.producerPayableCents)}
                      </span>
                    </li>
                  </ul>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Comissões dos promotores"
                  description="Saldo devido a cada promotor neste evento."
                />
                {commissions.length === 0 ? (
                  <EmptyState
                    title="Nenhuma comissão em aberto"
                    description="As comissões acumulam conforme as vendas atribuídas a promotores são pagas."
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {commissions.map((c) => (
                      <li
                        key={c.promoterId}
                        className="flex items-center justify-between gap-3 px-5 py-3"
                      >
                        <span className="font-medium text-ink">{c.name}</span>
                        <span className="tabular-nums text-ink-soft">{fmtBRL(c.owedCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Alert tone="neutral" className="m-4 mt-0">
                  Para registrar um repasse ou marcar comissões como pagas, use{" "}
                  <Link
                    href={`/painel/${orgSlug}/eventos/${scopedEventSlug}/financeiro`}
                    className="font-medium text-brand hover:underline"
                  >
                    Financeiro do evento
                  </Link>
                  .
                </Alert>
              </Card>
            </div>
          ) : (
            <Alert tone="neutral" className="mt-4">
              Os números refletem os pedidos pagos registrados. Selecione um evento acima para ver o
              detalhamento financeiro completo, sem sair desta tela.
            </Alert>
          )}
        </>
      )}
    </>
  );
}
