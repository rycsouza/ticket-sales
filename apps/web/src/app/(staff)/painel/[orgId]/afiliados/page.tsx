import type { Metadata } from "next";
import { Ticket, Users } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import {
  toCommissionRuleResponse,
  toCouponResponse,
  toPromoterResponse,
} from "@/lib/serializers";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { commissionBaseLabel, discountValueLabel } from "@/lib/status";
import { NewCouponForm, NewRuleForm } from "../eventos/[eventId]/promoters/promoter-forms";
import { CreatePromoterForm, RegenerateReportButton } from "./afiliados-client";

export const metadata: Metadata = { title: "Afiliados — Ingressos" };

export default async function AfiliadosPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);
  const s = getServices();

  let promoters;
  try {
    promoters = (await s.promoters.listPromoters(ctx)).map(toPromoterResponse);
  } catch {
    return (
      <>
        <PageHeader title="Afiliados" />
        <Card>
          <CardBody>
            <Alert tone="neutral">
              Você não tem permissão para gerenciar afiliados desta organização.
            </Alert>
          </CardBody>
        </Card>
      </>
    );
  }

  const [coupons, rules] = await Promise.all([
    s.promoters.listOrgCoupons(ctx).then((r) => r.map(toCouponResponse)),
    s.promoters.listOrgCommissionRules(ctx).then((r) => r.map(toCommissionRuleResponse)),
  ]);
  // Only org-wide defaults (eventId null) are managed here; event-scoped ones
  // live in each event's "Promotores e cupons" tab.
  const orgCoupons = coupons.filter((c) => c.eventId === null);
  const orgRules = rules.filter((r) => r.eventId === null && r.active);
  const nameOf = (id: string | null) =>
    (id && promoters.find((p) => p.id === id)?.name) || "Afiliado";
  const promoterOptions = promoters.map((p) => ({ id: p.id, name: p.name }));
  const api = `/api/orgs/${orgId}`;

  return (
    <>
      <PageHeader
        title="Afiliados"
        description="Cadastre promoters da organização, gere o link do relatório e defina cupons e comissões padrão — depois vincule aos eventos."
      />

      <div className="mb-6">
        <CreatePromoterForm orgId={orgId} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Promoters da organização" />
          {promoters.length === 0 ? (
            <EmptyState
              icon={<Users className="size-5" />}
              title="Nenhum afiliado cadastrado"
              description="Cadastre o primeiro afiliado acima. Ele recebe um link de relatório próprio e pode ser vinculado a qualquer evento."
            />
          ) : (
            <ul className="divide-y divide-line">
              {promoters.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-ink">{p.name}</span>
                      {p.hasLogin && <Badge tone="brand">Com login</Badge>}
                      {!p.active && <Badge tone="neutral">Inativo</Badge>}
                    </span>
                    <span className="block truncate text-small text-ink-muted">
                      {[p.contactEmail, p.contactPhone].filter(Boolean).join(" · ") || "Sem contato"}
                    </span>
                  </span>
                  <RegenerateReportButton orgId={orgId} promoterId={p.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Org-wide default coupons */}
        <Card>
          <CardHeader
            title="Cupons da organização"
            description="Valem em todos os eventos, salvo cupom específico do evento com o mesmo código."
          />
          {orgCoupons.length === 0 ? (
            <EmptyState
              icon={<Ticket className="size-5" />}
              title="Nenhum cupom padrão"
              description="Crie um cupom que vale para toda a organização usando o formulário abaixo."
            />
          ) : (
            <ul className="divide-y divide-line">
              {orgCoupons.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-body">
                  <span className="min-w-0">
                    <span className="block font-mono font-medium text-ink">{c.code}</span>
                    <span className="text-small text-ink-muted">
                      {c.promoterId ? nameOf(c.promoterId) : "Cupom da organização"}
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

        {/* Org-wide default commission rules */}
        <Card>
          <CardHeader
            title="Comissão padrão"
            description="Regra aplicada a todos os eventos, salvo regra específica do evento."
          />
          {orgRules.length === 0 ? (
            <EmptyState
              title="Nenhuma regra padrão"
              description="Defina uma comissão padrão para os afiliados da organização."
            />
          ) : (
            <ul className="divide-y divide-line">
              {orgRules.map((r) => (
                <li key={r.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-ink">
                      {r.promoterId ? nameOf(r.promoterId) : "Todos os afiliados"}
                    </span>
                    <Badge tone="brand">{discountValueLabel(r.type, r.value)}</Badge>
                  </div>
                  <p className="mt-1 text-small text-ink-muted">
                    {discountValueLabel(r.type, r.value)}{" "}
                    {r.type === "PERCENT" ? commissionBaseLabel(r.base) : "por ingresso vendido"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <CardBody className="border-t border-line">
            <NewRuleForm apiBase={api} promoters={promoterOptions} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
