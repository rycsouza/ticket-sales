import type { Metadata } from "next";
import Link from "next/link";
import { Link2, Ticket, UserPlus, Users } from "lucide-react";
import { getTenantServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser, resolveOrg } from "@/lib/dashboard";
import { orgVocab } from "@/lib/org-vocab";
import {
  toCommissionRuleResponse,
  toCouponResponse,
  toPromoterAssignmentResponse,
  toPromoterLinkResponse,
  toPromoterResponse,
  toPromoterSummaryResponse,
} from "@/lib/serializers";
import { Badge, Card, CardBody, CardHeader, EmptyState, buttonVariants } from "@/components/ui";
import { commissionBaseLabel, discountValueLabel, fmtBRL } from "@/lib/status";
import { ActionButton, CopyButton } from "../../../../ui";
import { NewCouponForm, NewRuleForm } from "./promoter-forms";

export const metadata: Metadata = { title: "Promotores e cupons — Ingressos" };

export default async function PromotersPage({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId: orgParam, eventId: eventParam } = await params;
  const { userId } = await requireDashboardUser();
  const org = await resolveOrg(orgParam, userId);
  const vocab = orgVocab(org.niche);
  const orgId = org.id;
  const orgSlug = org.slug;
  const ctx = dashboardCtx(orgId, userId);
  const s = (await getTenantServices(org.id));

  const event = await s.events.getEventBySlugOrId(ctx, eventParam).catch(() => null);
  const eventId = event?.id ?? eventParam;

  const [assignments, links, coupons, rules, ranking, orgPromoters] = await Promise.all([
    s.promoters.listEventAssignments(ctx, eventId).then((r) => r.map(toPromoterAssignmentResponse)),
    s.promoters.listLinks(ctx, eventId).then((r) => r.map(toPromoterLinkResponse)),
    s.promoters.listCoupons(ctx, eventId).then((r) => r.map(toCouponResponse)),
    s.promoters.listCommissionRules(ctx, eventId).then((r) => r.map(toCommissionRuleResponse)),
    s.promoters.eventRanking(ctx, eventId).then((r) => r.map(toPromoterSummaryResponse)),
    s.promoters.listPromoters(ctx).then((r) => r.map(toPromoterResponse)),
  ]);
  const eventPath = event ? `/evento/${event.slug}` : `/e/${eventId}`;
  const nameOf = (id: string | null) =>
    (id && orgPromoters.find((p) => p.id === id)?.name) || "Promotor";
  const linkByPromoter = new Map(links.map((l) => [l.promoterId, l]));
  const api = `/api/orgs/${orgId}/events/${eventId}`;
  const unassigned = orgPromoters.filter((p) => !assignments.some((a) => a.promoterId === p.id));
  const promoterOptions = orgPromoters.map((p) => ({ id: p.id, name: p.name }));
  const activeRules = rules.filter((r) => r.active);

  return (
    <div className="space-y-1">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-h2 text-ink">Promotores e cupons</h2>
          <p className="mt-0.5 text-small text-ink-muted">
            Vincule afiliados a este evento, gere links, e crie cupons/regras específicas do evento.
          </p>
        </div>
        <Link
          href={`/painel/${orgSlug}/afiliados`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Users className="size-4" />
          Gerenciar afiliados
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Promoters + links */}
        <Card>
          <CardHeader title={`Promotores ${vocab.ofEvent}`} />
          {assignments.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="size-5" />}
              title="Nenhum promotor vinculado"
              description={
                orgPromoters.length === 0
                  ? "Cadastre afiliados na seção Afiliados da organização e vincule-os aqui."
                  : `Vincule afiliados da organização a ${vocab.thisEvent} usando os botões abaixo.`
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {assignments.map((a) => {
                const link = linkByPromoter.get(a.promoterId);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0 text-body">
                      <span className="block font-medium text-ink">{nameOf(a.promoterId)}</span>
                      {link ? (
                        <span className="text-small text-ink-muted">
                          Link ativo · {link.clickCount} clique(s)
                        </span>
                      ) : (
                        <span className="text-small text-ink-faint">Sem link de divulgação</span>
                      )}
                    </span>
                    {link ? (
                      <CopyButton text={`${eventPath}?p=${link.code}`} label="Copiar link" />
                    ) : (
                      <ActionButton
                        url={`${api}/promoters/links`}
                        body={{ promoterId: a.promoterId }}
                        leftIcon={<Link2 className="size-4" />}
                      >
                        Gerar link
                      </ActionButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <CardBody className="border-t border-line">
            {orgPromoters.length > 0 ? (
              <div className="space-y-2">
                <p className="text-small text-ink-muted">Vincular afiliado {vocab.gender === "f" ? "à" : "ao"} {vocab.event}:</p>
                {unassigned.length === 0 ? (
                  <p className="text-small text-ink-faint">Todos os afiliados já foram vinculados.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {unassigned.map((p) => (
                      <ActionButton
                        key={p.id}
                        url={`${api}/promoters`}
                        body={{ promoterId: p.id }}
                        variant="secondary"
                        leftIcon={<UserPlus className="size-4" />}
                      >
                        {p.name}
                      </ActionButton>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                href={`/painel/${orgSlug}/afiliados`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Users className="size-4" />
                Cadastrar afiliados
              </Link>
            )}
          </CardBody>
        </Card>

        {/* Coupons */}
        <Card>
          <CardHeader title={`Cupons ${vocab.ofEvent}`} />
          {coupons.length === 0 ? (
            <EmptyState
              icon={<Ticket className="size-5" />}
              title="Nenhum cupom criado"
              description={`Crie descontos específicos ${vocab.ofEvent}. Cupons da organização inteira ficam na seção Afiliados.`}
            />
          ) : (
            <ul className="divide-y divide-line">
              {coupons.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-body">
                  <span className="min-w-0">
                    <span className="block font-mono font-medium text-ink">{c.code}</span>
                    <span className="text-small text-ink-muted">
                      {c.promoterId ? nameOf(c.promoterId) : "Cupom do evento"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-small">
                    <span className="block font-medium text-ink">
                      {discountValueLabel(c.type, c.value)} de desconto
                    </span>
                    <span className="text-ink-muted">{c.redemptions} uso(s)</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <CardBody className="border-t border-line">
            <NewCouponForm apiBase={api} promoters={promoterOptions} />
          </CardBody>
        </Card>

        {/* Commission rules + ranking */}
        <Card className="lg:col-span-2">
          <CardHeader title="Comissão" description={`Como a comissão dos promotores é calculada ${vocab.inThisEvent}.`} />
          {activeRules.length === 0 ? (
            <EmptyState
              title="Nenhuma regra de comissão"
              description="Defina uma regra para acumular comissões automaticamente a cada venda atribuída a um promotor. Regras da organização também se aplicam."
            />
          ) : (
            <ul className="divide-y divide-line">
              {activeRules.map((r) => (
                <li key={r.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-ink">
                      {r.promoterId ? "Comissão específica" : "Comissão padrão"}
                    </span>
                    <Badge tone="brand">{discountValueLabel(r.type, r.value)}</Badge>
                  </div>
                  <p className="mt-1 text-small text-ink-muted">
                    {discountValueLabel(r.type, r.value)}{" "}
                    {r.type === "PERCENT" ? commissionBaseLabel(r.base) : vocab.perTicketSold} ·{" "}
                    {r.promoterId
                      ? `aplicada a ${nameOf(r.promoterId)}`
                      : "aplicada a todos os promotores"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <CardBody className="space-y-4 border-t border-line">
            <NewRuleForm apiBase={api} promoters={promoterOptions} />
            {ranking.length > 0 && (
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-faint">
                  Ranking de promotores
                </p>
                <ul className="space-y-1">
                  {ranking.map((r) => (
                    <li key={r.promoterId} className="flex justify-between text-body">
                      <span className="text-ink-soft">{nameOf(r.promoterId)}</span>
                      <span className="text-ink">
                        {r.quantity} ingresso(s) ·{" "}
                        <strong className="tabular-nums">{fmtBRL(r.amountCents)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
