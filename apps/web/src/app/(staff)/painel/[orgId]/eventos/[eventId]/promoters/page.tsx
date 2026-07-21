import type { Metadata } from "next";
import { Link2, Ticket, UserPlus } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import {
  toCommissionRuleResponse,
  toCouponResponse,
  toPromoterAssignmentResponse,
  toPromoterLinkResponse,
  toPromoterSummaryResponse,
} from "@/lib/serializers";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { commissionBaseLabel, discountValueLabel, fmtBRL } from "@/lib/status";
import { ActionButton, CopyButton } from "../../../../ui";
import { NewCouponForm, NewRuleForm } from "./promoter-forms";

export const metadata: Metadata = { title: "Promotores e cupons — Ingressos" };

const short = (id: string) => id.slice(0, 8);

export default async function PromotersPage({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId, eventId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);
  const s = getServices();

  const [assignments, links, coupons, rules, ranking, members, event] = await Promise.all([
    s.promoters.listPromoters(ctx, eventId).then((r) => r.map(toPromoterAssignmentResponse)),
    s.promoters.listLinks(ctx, eventId).then((r) => r.map(toPromoterLinkResponse)),
    s.promoters.listCoupons(ctx, eventId).then((r) => r.map(toCouponResponse)),
    s.promoters.listCommissionRules(ctx, eventId).then((r) => r.map(toCommissionRuleResponse)),
    s.promoters.eventRanking(ctx, eventId).then((r) => r.map(toPromoterSummaryResponse)),
    s.identity.listMembers(ctx),
    s.events.getEvent(ctx, eventId).catch(() => null),
  ]);
  const eventPath = event ? `/evento/${event.slug}` : `/e/${eventId}`;
  const promoterMembers = members.filter((m) => m.role === "PROMOTER" && m.status === "ACTIVE");
  const linkByMember = new Map(links.map((l) => [l.membershipId, l]));
  const api = `/api/orgs/${orgId}/events/${eventId}`;
  const unassigned = promoterMembers.filter((m) => !assignments.some((a) => a.membershipId === m.id));
  const activeRules = rules.filter((r) => r.active);

  return (
    <div className="space-y-1">
      <div className="mb-5">
        <h2 className="text-h2 text-ink">Promotores e cupons</h2>
        <p className="mt-0.5 text-small text-ink-muted">
          Atribua promotores, gere links rastreáveis, crie cupons e defina regras de comissão.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Promoters + links */}
        <Card>
          <CardHeader title="Promotores do evento" />
          {assignments.length === 0 ? (
            promoterMembers.length === 0 ? (
              <EmptyState
                icon={<UserPlus className="size-5" />}
                title="Nenhum promotor atribuído"
                description="Você ainda não possui membros com o papel de promotor. Convide membros da equipe com esse papel para atribuí-los aqui."
              />
            ) : (
              <EmptyState
                icon={<UserPlus className="size-5" />}
                title="Nenhum promotor atribuído"
                description="Adicione membros da equipe para acompanhar vendas e comissões individuais. Use os botões abaixo."
              />
            )
          ) : (
            <ul className="divide-y divide-line">
              {assignments.map((a) => {
                const link = linkByMember.get(a.membershipId);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0 text-body">
                      <span className="block font-medium text-ink">Promotor #{short(a.membershipId)}</span>
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
                        body={{ membershipId: a.membershipId }}
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
            {promoterMembers.length > 0 ? (
              <div className="space-y-2">
                <p className="text-small text-ink-muted">Atribuir promotor ao evento:</p>
                {unassigned.length === 0 ? (
                  <p className="text-small text-ink-faint">Todos os promotores já foram atribuídos.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {unassigned.map((m) => (
                      <ActionButton
                        key={m.id}
                        url={`${api}/promoters`}
                        body={{ membershipId: m.id }}
                        variant="secondary"
                        leftIcon={<UserPlus className="size-4" />}
                      >
                        Promotor #{short(m.id)}
                      </ActionButton>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-small text-ink-muted">
                Convide membros com o papel de promotor pela gestão de equipe para atribuí-los aqui.
              </p>
            )}
          </CardBody>
        </Card>

        {/* Coupons */}
        <Card>
          <CardHeader title="Cupons" />
          {coupons.length === 0 ? (
            <EmptyState
              icon={<Ticket className="size-5" />}
              title="Nenhum cupom criado"
              description="Crie descontos para campanhas, parceiros ou compradores específicos usando o formulário abaixo."
            />
          ) : (
            <ul className="divide-y divide-line">
              {coupons.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-body">
                  <span className="min-w-0">
                    <span className="block font-mono font-medium text-ink">{c.code}</span>
                    <span className="text-small text-ink-muted">
                      {c.membershipId ? `Promotor #${short(c.membershipId)}` : "Cupom da organização"}
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
            <NewCouponForm apiBase={api} promoterMembers={promoterMembers.map((m) => m.id)} />
          </CardBody>
        </Card>

        {/* Commission rules + ranking */}
        <Card className="lg:col-span-2">
          <CardHeader title="Comissão" description="Como a comissão dos promotores é calculada." />
          {activeRules.length === 0 ? (
            <EmptyState
              title="Nenhuma regra de comissão"
              description="Defina uma regra para acumular comissões automaticamente a cada venda atribuída a um promotor."
            />
          ) : (
            <ul className="divide-y divide-line">
              {activeRules.map((r) => (
                <li key={r.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-ink">
                      {r.membershipId ? "Comissão específica" : "Comissão padrão"}
                    </span>
                    <Badge tone="brand">{discountValueLabel(r.type, r.value)}</Badge>
                  </div>
                  <p className="mt-1 text-small text-ink-muted">
                    {discountValueLabel(r.type, r.value)}{" "}
                    {r.type === "PERCENT" ? commissionBaseLabel(r.base) : "por ingresso vendido"} ·{" "}
                    {r.membershipId
                      ? `aplicada ao promotor #${short(r.membershipId)}`
                      : "aplicada a todos os promotores"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <CardBody className="space-y-4 border-t border-line">
            <NewRuleForm apiBase={api} promoterMembers={promoterMembers.map((m) => m.id)} />
            {ranking.length > 0 && (
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-faint">
                  Ranking de promotores
                </p>
                <ul className="space-y-1">
                  {ranking.map((r) => (
                    <li key={r.membershipId} className="flex justify-between text-body">
                      <span className="text-ink-soft">Promotor #{short(r.membershipId)}</span>
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
