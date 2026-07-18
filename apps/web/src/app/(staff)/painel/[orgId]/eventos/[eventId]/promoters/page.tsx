import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Link2 } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import {
  toCommissionRuleResponse,
  toCouponResponse,
  toPromoterAssignmentResponse,
  toPromoterLinkResponse,
  toPromoterSummaryResponse,
} from "@/lib/serializers";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { fmtBRL } from "@/lib/status";
import { ActionButton, CopyButton } from "../../../../ui";
import { NewCouponForm, NewRuleForm } from "./promoter-forms";

export const metadata: Metadata = { title: "Promoters — Ingressos" };

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

  const [assignments, links, coupons, rules, ranking, members] = await Promise.all([
    s.promoters.listPromoters(ctx, eventId).then((r) => r.map(toPromoterAssignmentResponse)),
    s.promoters.listLinks(ctx, eventId).then((r) => r.map(toPromoterLinkResponse)),
    s.promoters.listCoupons(ctx, eventId).then((r) => r.map(toCouponResponse)),
    s.promoters.listCommissionRules(ctx, eventId).then((r) => r.map(toCommissionRuleResponse)),
    s.promoters.eventRanking(ctx, eventId).then((r) => r.map(toPromoterSummaryResponse)),
    s.identity.listMembers(ctx),
  ]);
  const promoterMembers = members.filter((m) => m.role === "PROMOTER" && m.status === "ACTIVE");
  const linkByMember = new Map(links.map((l) => [l.membershipId, l]));
  const api = `/api/orgs/${orgId}/events/${eventId}`;
  const unassigned = promoterMembers.filter(
    (m) => !assignments.some((a) => a.membershipId === m.id),
  );

  return (
    <>
      <Link
        href={`/painel/${orgId}/eventos/${eventId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-small font-medium text-brand hover:underline"
      >
        <ArrowLeft className="size-4" />
        Evento
      </Link>
      <PageHeader
        title="Promoters & cupons"
        description="Atribua promoters, gere links rastreáveis, crie cupons e regras de comissão."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Assigned promoters + links */}
        <Card>
          <CardHeader title="Promoters do evento" />
          {assignments.length === 0 ? (
            <EmptyState
              title="Nenhum promoter atribuído"
              description="Atribua membros com papel PROMOTER abaixo."
            />
          ) : (
            <ul className="divide-y divide-line">
              {assignments.map((a) => {
                const link = linkByMember.get(a.membershipId);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0 text-body">
                      <span className="block font-mono text-small text-ink-muted">
                        #{short(a.membershipId)}
                      </span>
                      {link ? (
                        <span className="text-small text-ink-soft">
                          ?p={link.code} · {link.clickCount} cliques
                        </span>
                      ) : (
                        <span className="text-small text-ink-muted">sem link</span>
                      )}
                    </span>
                    {link ? (
                      <CopyButton text={`/e/${eventId}?p=${link.code}`} label="Copiar link" />
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
                <p className="text-small text-ink-muted">Atribuir promoter (papel PROMOTER):</p>
                {unassigned.length === 0 ? (
                  <p className="text-small text-ink-faint">Todos já atribuídos.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {unassigned.map((m) => (
                      <ActionButton
                        key={m.id}
                        url={`${api}/promoters`}
                        body={{ membershipId: m.id }}
                        variant="secondary"
                      >
                        + #{short(m.id)}
                      </ActionButton>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-small text-ink-muted">
                Convide promoters pela gestão de equipe (papel PROMOTER) para atribuí-los aqui.
              </p>
            )}
          </CardBody>
        </Card>

        {/* Coupons */}
        <Card>
          <CardHeader title="Cupons" />
          {coupons.length === 0 ? (
            <EmptyState title="Nenhum cupom" description="Crie o primeiro cupom abaixo." />
          ) : (
            <ul className="divide-y divide-line">
              {coupons.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-2.5 text-body">
                  <span className="font-mono font-medium text-ink">{c.code}</span>
                  <span className="text-small text-ink-muted">
                    {c.type === "PERCENT" ? `${c.value / 100}%` : fmtBRL(c.value)} · {c.redemptions}{" "}
                    usos
                    {c.membershipId ? ` · #${short(c.membershipId)}` : ""}
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
          <CardHeader title="Comissão" />
          {rules.filter((r) => r.active).length === 0 ? (
            <EmptyState
              title="Nenhuma regra de comissão"
              description="Defina uma regra para acumular comissões automaticamente."
            />
          ) : (
            <ul className="divide-y divide-line">
              {rules
                .filter((r) => r.active)
                .map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-5 py-2.5 text-body">
                    <span className="text-ink">
                      {r.type === "PERCENT" ? `${r.value / 100}%` : fmtBRL(r.value)}
                      {r.membershipId ? ` · #${short(r.membershipId)}` : " · todos"}
                    </span>
                    <Badge tone="neutral">
                      {r.base === "AFTER_DISCOUNT" ? "após desconto" : "nominal"}
                    </Badge>
                  </li>
                ))}
            </ul>
          )}
          <CardBody className="space-y-4 border-t border-line">
            <NewRuleForm apiBase={api} promoterMembers={promoterMembers.map((m) => m.id)} />
            {ranking.length > 0 && (
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-faint">
                  Ranking
                </p>
                <ul className="space-y-1">
                  {ranking.map((r) => (
                    <li key={r.membershipId} className="flex justify-between text-body">
                      <span className="font-mono text-small text-ink-muted">
                        #{short(r.membershipId)}
                      </span>
                      <span className="text-ink">
                        {r.quantity} ing. ·{" "}
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
    </>
  );
}
