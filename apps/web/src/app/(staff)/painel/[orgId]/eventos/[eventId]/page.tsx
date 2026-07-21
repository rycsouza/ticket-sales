import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CircleSlash,
  Clock,
  Info,
  PauseCircle,
  Percent,
  Plus,
  Tag,
  Ticket,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { EventFinancialSummary } from "@ingressos/core";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toBatchResponse, toEventResponse, toTicketTypeResponse } from "@/lib/serializers";
import { Alert, Card, CardBody, CardHeader, Stat, buttonVariants } from "@/components/ui";
import { fmtBRL, fmtDateTime } from "@/lib/status";

export const metadata: Metadata = { title: "Visão geral — Ingressos" };

export default async function EventOverview({
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

  // Finance summary is role-gated — non-finance roles simply don't see money KPIs.
  let finance: EventFinancialSummary | null = null;
  try {
    finance = await services.finance.getEventFinancialSummary(ctx, eventId);
  } catch {
    finance = null;
  }

  const base = `/painel/${orgId}/eventos/${eventId}`;

  const soldQty = batches.reduce((sum, b) => sum + b.quantitySold, 0);
  const reservedQty = batches.reduce((sum, b) => sum + b.quantityReserved, 0);
  const totalQty = batches.reduce((sum, b) => sum + b.quantityTotal, 0);
  const capacity = event.capacityTotal ?? (totalQty > 0 ? totalQty : null);
  const capacityPct = capacity && capacity > 0 ? Math.min(100, Math.round((soldQty / capacity) * 100)) : null;

  const openBatches = batches.filter((b) => b.status === "OPEN");
  const availableOpen = openBatches.filter(
    (b) => b.quantitySold + b.quantityReserved < b.quantityTotal,
  );
  const now = Date.now();
  const endingSoon = openBatches.find(
    (b) => b.salesEndAt && new Date(b.salesEndAt).getTime() - now < 48 * 3600 * 1000,
  );

  // ---- Operational alerts (only what the data can prove) ------------------
  const alerts: { key: string; tone: "warning" | "info" | "danger"; icon: ReactNode; title: string; body: string; href?: string; cta?: string }[] = [];
  if (event.status === "SALES_PAUSED") {
    alerts.push({ key: "paused", tone: "warning", icon: <PauseCircle className="size-5" />, title: "Vendas pausadas", body: "Os compradores veem a página, mas não conseguem comprar. Retome pelo botão Gerenciar." });
  }
  if (ticketTypes.length === 0) {
    alerts.push({ key: "no-types", tone: "warning", icon: <AlertTriangle className="size-5" />, title: "Nenhum tipo de ingresso", body: "Crie tipos de ingresso e lotes para poder vender.", href: `${base}/ingressos`, cta: "Configurar" });
  } else if (batches.length === 0) {
    alerts.push({ key: "no-batches", tone: "warning", icon: <AlertTriangle className="size-5" />, title: "Nenhum lote criado", body: "Um lote define preço, quantidade e período de venda. Crie o primeiro para começar.", href: `${base}/ingressos`, cta: "Criar lote" });
  } else if (["PUBLISHED", "SALES_PAUSED"].includes(event.status) && availableOpen.length === 0) {
    alerts.push({ key: "no-open", tone: "warning", icon: <CircleSlash className="size-5" />, title: "Nenhum lote disponível para venda", body: "O evento está no ar, mas não há lote aberto com ingressos. Abra um lote para vender.", href: `${base}/ingressos`, cta: "Gerenciar lotes" });
  }
  if (endingSoon) {
    alerts.push({ key: "ending", tone: "info", icon: <Clock className="size-5" />, title: "Lote perto de encerrar", body: `O lote "${endingSoon.name}" encerra em breve (${fmtDateTime(endingSoon.salesEndAt)}).`, href: `${base}/ingressos`, cta: "Ver lotes" });
  }
  if (event.status === "DRAFT") {
    alerts.push({ key: "draft", tone: "info", icon: <Info className="size-5" />, title: "Evento em rascunho", body: "A página ainda não está pública. Revise ingressos, lotes e a página e use “Publicar evento”." });
  }

  const hasPublicPage = ["PUBLISHED", "SALES_PAUSED", "SALES_CLOSED"].includes(event.status);

  return (
    <div className="space-y-6">
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Alert
              key={a.key}
              tone={a.tone}
              icon={a.icon}
              title={a.title}
              action={
                a.href && a.cta ? (
                  <Link href={a.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {a.cta}
                  </Link>
                ) : undefined
              }
            >
              {a.body}
            </Alert>
          ))}
        </div>
      )}

      {/* KPIs — only metrics with a real source. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Ingressos vendidos"
          value={soldQty.toLocaleString("pt-BR")}
          icon={<Ticket className="size-4" />}
          hint={capacity ? `de ${capacity.toLocaleString("pt-BR")} de capacidade` : reservedQty > 0 ? `${reservedQty} reservados agora` : undefined}
        />
        <Stat
          label="Capacidade utilizada"
          value={capacityPct !== null ? `${capacityPct}%` : "—"}
          icon={<Percent className="size-4" />}
          hint={capacityPct === null ? "Defina a capacidade do evento" : `${soldQty}/${capacity}`}
        />
        {finance ? (
          <>
            <Stat
              label="Receita bruta"
              value={fmtBRL(finance.grossSalesCents)}
              icon={<TrendingUp className="size-4" />}
              hint="Total vendido antes de taxas e descontos"
            />
            <Stat
              label="A repassar"
              value={fmtBRL(finance.producerPayableCents)}
              icon={<Wallet className="size-4" />}
              hint="Saldo do evento a receber"
            />
          </>
        ) : (
          <Stat
            label="Lotes abertos"
            value={availableOpen.length.toLocaleString("pt-BR")}
            icon={<Tag className="size-4" />}
            hint={`${batches.length} lote(s) no total`}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sales summary */}
        <Card className="lg:col-span-2">
          <CardHeader title="Resumo de vendas" />
          <CardBody className="space-y-5">
            {capacity ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-small">
                  <span className="text-ink-soft">Progresso de capacidade</span>
                  <span className="tabular-nums text-ink-muted">
                    {soldQty}/{capacity} ({capacityPct}%)
                  </span>
                </div>
                <div
                  className="h-2.5 w-full overflow-hidden rounded-full bg-hover"
                  role="progressbar"
                  aria-valuenow={capacityPct ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progresso de capacidade"
                >
                  <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${capacityPct}%` }} />
                </div>
              </div>
            ) : (
              <p className="text-small text-ink-muted">
                Defina a capacidade do evento para acompanhar o progresso de vendas.
              </p>
            )}

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-small text-ink-muted">Vendidos</dt>
                <dd className="text-h3 tabular-nums text-ink">{soldQty}</dd>
              </div>
              <div>
                <dt className="text-small text-ink-muted">Reservados</dt>
                <dd className="text-h3 tabular-nums text-ink">{reservedQty}</dd>
              </div>
              <div>
                <dt className="text-small text-ink-muted">Lotes abertos</dt>
                <dd className="text-h3 tabular-nums text-ink">{availableOpen.length}</dd>
              </div>
            </dl>

            {availableOpen.length > 0 && (
              <div className="rounded-lg border border-line bg-subtle p-3">
                <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-ink-faint">
                  Lote em venda
                </p>
                <div className="flex items-center justify-between gap-3 text-body">
                  <span className="min-w-0 truncate text-ink">{availableOpen[0]!.name}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">
                    {fmtBRL(availableOpen[0]!.priceCents)} ·{" "}
                    {availableOpen[0]!.quantityTotal - availableOpen[0]!.quantitySold - availableOpen[0]!.quantityReserved}{" "}
                    restantes
                  </span>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader title="Ações rápidas" />
          <CardBody className="space-y-2">
            <Link
              href={`${base}/ingressos`}
              className={buttonVariants({ variant: "outline", size: "md", className: "w-full justify-start" })}
            >
              <Plus className="size-4" />
              Criar lote
            </Link>
            <Link
              href={`${base}/promoters`}
              className={buttonVariants({ variant: "outline", size: "md", className: "w-full justify-start" })}
            >
              <Tag className="size-4" />
              Criar cupom
            </Link>
            {finance && (
              <a
                href={`/api/orgs/${orgId}/events/${eventId}/finance/export`}
                className={buttonVariants({ variant: "outline", size: "md", className: "w-full justify-start" })}
              >
                <TrendingUp className="size-4" />
                Exportar extrato (CSV)
              </a>
            )}
            {!hasPublicPage && (
              <p className="pt-1 text-small text-ink-muted">
                Publique o evento para compartilhar o link de vendas.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
