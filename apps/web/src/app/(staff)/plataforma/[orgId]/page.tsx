import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, LayoutDashboard } from "lucide-react";
import { parseStoredTrustItems } from "@ingressos/core";
import { dashboardCtx } from "@/lib/dashboard";
import { getPlatformServices, getTenantServices } from "@/lib/services";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { orgVocab, publicEventPath } from "@/lib/org-vocab";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Badge } from "@/components/ui";
import { EVENT_STATUS, statusMeta } from "@/lib/status";
import { EventFeeForm, ExternalPayoutForm, OrgDefaultFeeForm } from "../admin-forms";
import { OrgSettingsForm } from "../../painel/[orgId]/configuracoes/settings-form";
import { StorefrontEditor } from "../../painel/[orgId]/vitrine/storefront-editor";

export const metadata: Metadata = {
  title: "Plataforma — Organização",
  robots: { index: false, follow: false },
};

export default async function PlatformOrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const admin = await requirePlatformAdmin();
  const { orgId } = await params;
  // Identidade vem do plano de controle; negócio vem do banco DO tenant.
  const org = await getPlatformServices().identity.getOrganizationAsPlatformAdmin(orgId);
  const s = await getTenantServices(orgId);
  const events = await s.events.listEventsAsPlatformAdmin(orgId);
  const vocab = orgVocab(org.niche);

  // Config da vitrine para o editor — o admin autoriza via o OWNER sintético
  // do composition root (lib/admin-membership.ts), sem precisar de membership.
  const storefrontPage = await getPlatformServices()
    .storefront.getForOrg(dashboardCtx(org.id, admin.userId))
    .catch(() => null);

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

      <PageHeader
        title={org.name}
        description="Configuração completa da organização: painel, preferências, vitrine, taxa e repasses."
      />

      <div className="mt-3 flex flex-wrap gap-3">
        <Link
          href={`/painel/${org.slug}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-small font-medium text-ink transition-colors hover:bg-subtle"
        >
          <LayoutDashboard className="size-4" />
          Abrir painel da organização
        </Link>
        <Link
          href={`/${org.slug}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-small font-medium text-ink transition-colors hover:bg-subtle"
        >
          <ExternalLink className="size-4" />
          Ver página pública /{org.slug}
        </Link>
      </div>

      <div className="mt-6 space-y-6">
        <section>
          <h2 className="text-h3 font-semibold text-ink">Configurações</h2>
          <p className="mt-0.5 text-small text-ink-muted">
            Segmento do negócio (vocabulário do produto) e fuso horário padrão.
          </p>
          <div className="mt-3 max-w-xl">
            <OrgSettingsForm
              orgId={org.id}
              initialTimezone={org.timezone}
              initialNiche={org.niche}
            />
          </div>
        </section>

        <section>
          <h2 className="text-h3 font-semibold text-ink">Vitrine pública</h2>
          <p className="mt-0.5 text-small text-ink-muted">
            Landing page da produtora em /{org.slug} — marca, textos, imagens e cor do painel.
          </p>
          <div className="mt-3 max-w-2xl">
            <StorefrontEditor
              orgId={org.id}
              orgSlug={org.slug}
              niche={org.niche}
              initial={
                storefrontPage
                  ? {
                      enabled: storefrontPage.enabled,
                      brandColor: storefrontPage.brandColor ?? "",
                      tagline: storefrontPage.tagline ?? "",
                      headline: storefrontPage.headline ?? "",
                      headlineHighlight: storefrontPage.headlineHighlight ?? "",
                      subheadline: storefrontPage.subheadline ?? "",
                      heroImageUrl: storefrontPage.heroImageUrl ?? "",
                      logoUrl: storefrontPage.logoUrl ?? "",
                      whatsapp: storefrontPage.whatsapp ?? "",
                      instagram: storefrontPage.instagram ?? "",
                      seoTitle: storefrontPage.seoTitle ?? "",
                      seoDescription: storefrontPage.seoDescription ?? "",
                      footerNote: storefrontPage.footerNote ?? "",
                      trustItems: parseStoredTrustItems(storefrontPage.trustItems),
                    }
                  : null
              }
            />
          </div>
        </section>

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
            title={vocab.Events}
            description={`Ajuste a taxa de cada ${vocab.event} e registre repasses externos. Mudanças de taxa valem para vendas futuras.`}
          />
          {events.length === 0 ? (
            <EmptyState
              title={vocab.noEventFound}
              description={`Esta organização ainda não tem ${vocab.events}.`}
            />
          ) : (
            <ul className="divide-y divide-line">
              {events.map((ev) => (
                <li key={ev.id} className="space-y-3 px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{ev.title}</span>
                      <span className="text-small text-ink-muted">{publicEventPath(ev.slug, vocab)}</span>
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
