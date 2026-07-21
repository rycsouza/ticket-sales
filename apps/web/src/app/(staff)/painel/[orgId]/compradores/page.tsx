import type { Metadata } from "next";
import { MessageCircle, Repeat, Ticket, TrendingUp, Users } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toEventResponse } from "@/lib/serializers";
import { Badge, Card, CardBody, EmptyState, PageHeader, Stat, buttonVariants } from "@/components/ui";
import { fmtBRL } from "@/lib/status";
import { whatsappUrl } from "@/lib/format";
import { CrmExportButton, EventFilter, OptOutButton } from "./crm-client";

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
            <p className="text-body text-ink-muted">
              Você não tem permissão para ver os compradores desta organização.
            </p>
          </CardBody>
        </Card>
      </>
    );
  }

  const totalOrders = segment.customers.reduce((s, c) => s + c.orderCount, 0);
  const avgTicket = totalOrders > 0 ? Math.round(segment.totalSpentCents / totalOrders) : 0;
  const recurrentes = segment.customers.filter((c) => c.orderCount > 1).length;

  return (
    <>
      <PageHeader
        title="Compradores"
        description="Base construída automaticamente a cada pedido pago."
        actions={<CrmExportButton orgId={orgId} />}
      />

      {events.length > 0 && (
        <div className="mb-4 sm:max-w-xs">
          <EventFilter orgId={orgId} events={events.map((e) => ({ id: e.id, title: e.title }))} selected={eventId ?? ""} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pessoas" value={segment.count.toLocaleString("pt-BR")} icon={<Users className="size-4" />} />
        <Stat label="Em compras" value={fmtBRL(segment.totalSpentCents)} icon={<TrendingUp className="size-4" />} />
        <Stat label="Ticket médio" value={fmtBRL(avgTicket)} hint="Por pedido" icon={<Ticket className="size-4" />} />
        <Stat
          label="Recorrentes"
          value={recurrentes.toLocaleString("pt-BR")}
          hint="Com mais de 1 pedido"
          icon={<Repeat className="size-4" />}
        />
      </div>

      <Card>
        {segment.customers.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title={eventId ? "Nenhum comprador neste evento" : "Nenhum comprador ainda"}
            description="A base é preenchida automaticamente a cada pedido pago."
          />
        ) : (
          <ul className="divide-y divide-line">
            {segment.customers.map((c) => {
              const wa = whatsappUrl(c.phone);
              return (
                <li key={c.email} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-body font-medium text-ink">
                      {c.name ?? c.email}
                    </span>
                    <span className="block truncate text-small text-ink-muted">
                      {c.email} · {c.orderCount} pedido(s) · {fmtBRL(c.totalSpentCents)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {c.optedOut && <Badge tone="warning">opt-out</Badge>}
                    {wa && !c.optedOut && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Conversar no WhatsApp com ${c.name ?? c.email}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <MessageCircle className="size-4 text-success" />
                        WhatsApp
                      </a>
                    )}
                    <OptOutButton orgId={orgId} email={c.email} optedOut={c.optedOut} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-small text-ink-muted">
        A base respeita consentimento e opt-out (LGPD). Compradores inativos por mais de 24 meses são
        anonimizados automaticamente.
      </p>
    </>
  );
}
