import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ShieldCheck, Users } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toEventResponse } from "@/lib/serializers";
import { Alert, Card, CardBody, EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { EventFilterSelect } from "../../ui";
import { ExportBuyersDialog } from "./crm-client";
import { BuyersClient, type BuyerRow } from "./buyers-client";

export const metadata: Metadata = { title: "Compradores — Ingressos" };

export default async function CrmPage({
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

  let segment;
  try {
    segment = await services.customers.getSegment(ctx, {
      includeOptedOut: true,
      ...(eventId ? { eventId } : {}),
    });
  } catch {
    return (
      <>
        <PageHeader title="Compradores" />
        <Card>
          <CardBody>
            <Alert tone="neutral">
              Você não tem permissão para ver os compradores desta organização.
            </Alert>
          </CardBody>
        </Card>
      </>
    );
  }

  const rows: BuyerRow[] = segment.customers.map((c) => ({
    email: c.email,
    name: c.name,
    phone: c.phone,
    optedOut: c.optedOut,
    orderCount: c.orderCount,
    totalSpentCents: c.totalSpentCents,
    lastPurchaseAt: c.lastPurchaseAt ? c.lastPurchaseAt.toISOString() : null,
  }));

  const noBuyers = rows.length === 0 && !eventId;

  return (
    <>
      <PageHeader
        title="Compradores"
        description="Pessoas que realizaram pedidos pagos nos eventos da sua produtora."
        actions={<ExportBuyersDialog orgId={orgId} eventId={eventId} estimated={segment.count} />}
      />

      {events.length > 0 && (
        <div className="mb-4 sm:max-w-xs">
          <EventFilterSelect
            basePath={`/painel/${orgId}/compradores`}
            events={events.map((e) => ({ id: e.id, title: e.title }))}
            selected={eventId ?? ""}
            ariaLabel="Filtrar compradores por evento"
          />
        </div>
      )}

      {noBuyers ? (
        <Card>
          <EmptyState
            icon={<Users className="size-5" />}
            title="Nenhum comprador ainda"
            description="Os compradores aparecerão aqui automaticamente após a confirmação dos primeiros pedidos pagos."
            action={
              <Link href={`/painel/${orgId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <CalendarDays className="size-4" />
                Ver eventos
              </Link>
            }
          />
        </Card>
      ) : (
        <BuyersClient orgId={orgId} rows={rows} eventScoped={!!eventId} />
      )}

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-line bg-subtle p-4 text-small text-ink-muted">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ink-faint" />
        <div>
          <p className="font-medium text-ink">Privacidade dos compradores</p>
          <p className="mt-0.5">
            Os dados e as preferências de comunicação são administrados conforme as configurações de
            privacidade da plataforma. Compradores sem compras há mais de 24 meses são anonimizados
            automaticamente.
          </p>
        </div>
      </div>
    </>
  );
}
