import type { Metadata } from "next";
import Link from "next/link";
import { CircleDollarSign, Clock3, Receipt, ShoppingCart } from "lucide-react";
import { getTenantServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser, resolveOrg } from "@/lib/dashboard";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { fmtBRL, fmtDateTime, ORDER_STATUS, statusMeta } from "@/lib/status";
import { orgVocab, panelEventsBase } from "@/lib/org-vocab";

export const metadata: Metadata = { title: "Dashboard — Ingressos" };

/**
 * Org home: the landing after login. Today's numbers (in the ORG's timezone)
 * + the latest orders — the producer sees movement before anything else.
 * Counters are role-gated in the service (revenue only for finance-capable
 * roles); roles outside the allowlist just see the shell without numbers.
 */
export default async function OrgDashboard({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId: orgParam } = await params;
  const { userId } = await requireDashboardUser();
  const org = await resolveOrg(orgParam, userId);
  const vocab = orgVocab(org.niche);
  const ctx = dashboardCtx(org.id, userId);
  const services = await getTenantServices(org.id);

  const [stats, latest] = await Promise.all([
    services.support.getOrgDashboard(ctx, { timezone: org.timezone }).catch(() => null),
    services.support.searchOrders(ctx, { limit: 5 }).catch(() => null),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Resumo de hoje e últimos pedidos ${vocab.ofEvents} da produtora.`}
      />

      {stats && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.revenueTodayCents !== null && (
            <Stat
              label="Receita"
              value={fmtBRL(stats.revenueTodayCents)}
              icon={<CircleDollarSign className="size-4" />}
              hint="hoje"
            />
          )}
          <Stat
            label="Novos pedidos"
            value={stats.ordersTodayCount.toLocaleString("pt-BR")}
            icon={<ShoppingCart className="size-4" />}
            hint="hoje"
          />
          <Stat
            label="Pagos"
            value={stats.paidTotalCount.toLocaleString("pt-BR")}
            icon={<Receipt className="size-4" />}
            hint="total"
          />
          <Stat
            label="Aguardando"
            value={stats.awaitingCount.toLocaleString("pt-BR")}
            icon={<Clock3 className="size-4" />}
            hint="total"
          />
        </div>
      )}

      {latest && (
        <Card className="mt-6">
          <CardHeader
            title="Últimos pedidos"
            action={
              <Link
                href={`/painel/${org.slug}/pedidos`}
                className="text-small font-medium text-brand hover:underline"
              >
                Ver todos
              </Link>
            }
          />
          {latest.length === 0 ? (
            <EmptyState
              title="Nenhum pedido ainda"
              description={`Os pedidos ${vocab.ofEvents} publicados aparecem aqui em tempo real.`}
            />
          ) : (
            <ul className="divide-y divide-line">
              {latest.map((order) => {
                const meta = statusMeta(ORDER_STATUS, order.status);
                return (
                  <li key={order.id}>
                    <Link
                      href={`/painel/${org.slug}/pedidos/${order.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-hover"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {order.buyerName || order.buyerEmail}
                        </p>
                        <p className="truncate text-small text-ink-muted">
                          {order.code} · {fmtDateTime(order.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <span className="text-body font-semibold tabular-nums text-ink">
                          {fmtBRL(order.totalCents)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {!stats && !latest && (
        <Card className="mt-6">
          <CardBody>
            <p className="text-body text-ink-muted">
              Seu papel não tem acesso aos números — use o menu ao lado para ir direto{" "}
              {vocab.gender === "f" ? "às" : "aos"} {vocab.events}, {vocab.checkinArea.toLowerCase()}{" "}
              e demais seções.
            </p>
          </CardBody>
        </Card>
      )}

      <div className="mt-6">
        <Link
          href={panelEventsBase(org.slug, vocab)}
          className="text-small font-medium text-brand hover:underline"
        >
          Ir para {vocab.events} →
        </Link>
      </div>
    </>
  );
}
