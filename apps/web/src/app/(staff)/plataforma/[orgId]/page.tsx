import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPlatformServices, getTenantServices } from "@/lib/services";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Badge } from "@/components/ui";
import { EVENT_STATUS, statusMeta } from "@/lib/status";
import { EventFeeForm, ExternalPayoutForm, OrgDefaultFeeForm } from "../admin-forms";

export const metadata: Metadata = {
  title: "Plataforma — Organização",
  robots: { index: false, follow: false },
};

export default async function PlatformOrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  await requirePlatformAdmin();
  const { orgId } = await params;
  // Identidade vem do plano de controle; negócio vem do banco DO tenant.
  const org = await getPlatformServices().identity.getOrganizationAsPlatformAdmin(orgId);
  const s = await getTenantServices(orgId);
  const events = await s.events.listEventsAsPlatformAdmin(orgId);

  // Producer payable per event (for the external-payout context).
  const payables = new Map<string, number>();
  await Promise.all(
    events.map(async (ev) => {
      const summary = await s.finance
        .getEventFinancialSummaryAsPlatformAdmin(orgId, ev.id)
        .catch(() => null);
      payables.set(ev.id, summary?.producerPayableCents ?? 0);
    }),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/plataforma"
        className="mb-4 inline-flex items-center gap-1.5 text-small text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Todas as organizações
      </Link>

      <PageHeader title={org.name} description="Configuração de taxa e repasses da organização." />

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader
            title="Taxa padrão da organização"
            description="Aplicada automaticamente a novos eventos. Eventos existentes mantêm a taxa já definida."
          />
          <CardBody>
            <OrgDefaultFeeForm
              orgId={org.id}
              initialBps={org.defaultPlatformFeeBps}
              initialMode={org.defaultFeeMode}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Eventos"
            description="Ajuste a taxa de cada evento e registre repasses externos. Mudanças de taxa valem para vendas futuras."
          />
          {events.length === 0 ? (
            <EmptyState title="Nenhum evento" description="Esta organização ainda não tem eventos." />
          ) : (
            <ul className="divide-y divide-line">
              {events.map((ev) => (
                <li key={ev.id} className="space-y-3 px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{ev.title}</span>
                      <span className="text-small text-ink-muted">/evento/{ev.slug}</span>
                    </span>
                    <Badge tone={statusMeta(EVENT_STATUS, ev.status).tone}>
                      {statusMeta(EVENT_STATUS, ev.status).label}
                    </Badge>
                  </div>
                  <EventFeeForm
                    orgId={org.id}
                    eventId={ev.id}
                    initialBps={ev.platformFeeBps}
                    initialMode={ev.feeMode}
                  />
                  <details className="rounded-lg border border-line bg-subtle/40 px-3 py-2">
                    <summary className="cursor-pointer text-small font-medium text-ink-soft">
                      Registrar repasse externo
                    </summary>
                    <div className="pt-3">
                      <ExternalPayoutForm
                        orgId={org.id}
                        eventId={ev.id}
                        payableCents={payables.get(ev.id) ?? 0}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
