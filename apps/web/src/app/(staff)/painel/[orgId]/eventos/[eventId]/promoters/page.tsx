import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import {
  toCommissionRuleResponse,
  toCouponResponse,
  toPromoterAssignmentResponse,
  toPromoterLinkResponse,
  toPromoterSummaryResponse,
} from "@/lib/serializers";
import { DashboardHeader } from "../../../../header";
import { ActionButton, CopyButton } from "../../../../ui";
import { NewCouponForm, NewRuleForm } from "./promoter-forms";

export const metadata: Metadata = { title: "Promoters — Ingressos" };

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
const short = (id: string) => id.slice(0, 8);

export default async function PromotersPage({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId, eventId } = await params;
  const { userId } = await requireDashboardUser();
  const orgs = await getServices().identity.listMyOrganizations(userId);
  const org = orgs.find((o) => o.organization.id === orgId);
  if (!org) redirect("/painel");

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
  const base = `/painel/${orgId}/eventos/${eventId}`;
  const api = `/api/orgs/${orgId}/events/${eventId}`;

  return (
    <div className="mx-auto max-w-2xl">
      <DashboardHeader orgName={org.organization.name} orgId={orgId} />
      <main className="space-y-6 p-4">
        <div>
          <Link href={base} className="text-sm text-brand-600">
            ← Evento
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">Promoters & cupons</h1>
        </div>

        {/* Assigned promoters + links */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">
            Promoters do evento
          </h2>
          {assignments.length === 0 ? (
            <p className="text-sm text-ink-400">Nenhum promoter atribuído.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {assignments.map((a) => {
                const link = linkByMember.get(a.membershipId);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
                    <span className="min-w-0 text-sm">
                      <span className="block font-mono text-xs text-ink-400">#{short(a.membershipId)}</span>
                      {link ? (
                        <span className="text-ink-600">link: ?p={link.code} · {link.clickCount} cliques</span>
                      ) : (
                        <span className="text-ink-400">sem link</span>
                      )}
                    </span>
                    {link ? (
                      <CopyButton text={`/e/${eventId}?p=${link.code}`} label="Copiar link" />
                    ) : (
                      <ActionButton url={`${api}/promoters/links`} body={{ membershipId: a.membershipId }}>
                        Gerar link
                      </ActionButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {/* Assign a promoter */}
          {promoterMembers.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-xs text-ink-400">
                Atribuir promoter (membros com papel PROMOTER):
              </p>
              {promoterMembers
                .filter((m) => !assignments.some((a) => a.membershipId === m.id))
                .map((m) => (
                  <ActionButton key={m.id} url={`${api}/promoters`} body={{ membershipId: m.id }} variant="secondary">
                    + #{short(m.id)}
                  </ActionButton>
                ))}
            </div>
          ) : (
            <p className="text-xs text-ink-400">
              Convide promoters pela gestão de equipe (papel PROMOTER) para atribuí-los aqui.
            </p>
          )}
        </section>

        {/* Coupons */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Cupons</h2>
          {coupons.length === 0 ? (
            <p className="mb-3 text-sm text-ink-400">Nenhum cupom.</p>
          ) : (
            <ul className="mb-3 divide-y divide-slate-100">
              {coupons.map((c) => (
                <li key={c.id} className="flex justify-between py-2 text-sm">
                  <span className="font-mono">{c.code}</span>
                  <span className="text-ink-400">
                    {c.type === "PERCENT" ? `${c.value / 100}%` : brl(c.value)} · {c.redemptions} usos
                    {c.membershipId ? ` · promoter #${short(c.membershipId)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <NewCouponForm apiBase={api} promoterMembers={promoterMembers.map((m) => m.id)} />
        </section>

        {/* Commission rules + ranking */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">
            Comissão
          </h2>
          {rules.length === 0 ? (
            <p className="mb-3 text-sm text-ink-400">Nenhuma regra de comissão.</p>
          ) : (
            <ul className="mb-3 divide-y divide-slate-100">
              {rules.filter((r) => r.active).map((r) => (
                <li key={r.id} className="flex justify-between py-2 text-sm">
                  <span>
                    {r.type === "PERCENT" ? `${r.value / 100}%` : brl(r.value)}
                    {r.membershipId ? ` · #${short(r.membershipId)}` : " · todos"}
                  </span>
                  <span className="text-ink-400">{r.base === "AFTER_DISCOUNT" ? "após desconto" : "nominal"}</span>
                </li>
              ))}
            </ul>
          )}
          <NewRuleForm apiBase={api} promoterMembers={promoterMembers.map((m) => m.id)} />

          {ranking.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Ranking</p>
              <ul className="space-y-1 text-sm">
                {ranking.map((r) => (
                  <li key={r.membershipId} className="flex justify-between">
                    <span className="font-mono text-xs">#{short(r.membershipId)}</span>
                    <span>
                      {r.quantity} ing. · <strong>{brl(r.amountCents)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
