import type { Metadata } from "next";
import { HandCoins, Ticket, Users } from "lucide-react";
import { getTenantServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser, resolveOrg } from "@/lib/dashboard";
import { orgVocab } from "@/lib/org-vocab";
import {
  toCommissionRuleResponse,
  toCouponResponse,
  toEventResponse,
  toPromoterResponse,
} from "@/lib/serializers";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { commissionBaseLabel, discountValueLabel, fmtBRL } from "@/lib/status";
import { NewCouponForm, NewRuleForm } from "../eventos/[eventId]/promoters/promoter-forms";
import { PromoterPayoutButton } from "../eventos/[eventId]/financeiro/payout-form";
import { CreatePromoterForm, RegenerateReportButton } from "./afiliados-client";
import { EventPayoutSelect } from "./commission-payout";

export const metadata: Metadata = { title: "Afiliados — Ingressos" };

export default async function AfiliadosPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ evento?: string }>;
}) {
  const { orgId: orgParam } = await params;
  const { evento: selectedEventId } = await searchParams;
  const { userId } = await requireDashboardUser();
  const org = await resolveOrg(orgParam, userId);
  const vocab = orgVocab(org.niche);
  const orgId = org.id;
  const ctx = dashboardCtx(orgId, userId);
  const s = (await getTenantServices(org.id));

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

  const [coupons, rules, events] = await Promise.all([
    s.promoters.listOrgCoupons(ctx).then((r) => r.map(toCouponResponse)),
    s.promoters.listOrgCommissionRules(ctx).then((r) => r.map(toCommissionRuleResponse)),
    s.events.listEvents(ctx).then((r) => r.map(toEventResponse)).catch(() => []),
  ]);

  // Commission payouts are always event-scoped (payables come from each event's
  // ledger). When an event is picked, load its open promoter payables.
  const eventOptions = events.map((e) => ({ id: e.id, title: e.title }));
  const validEventId = selectedEventId && events.some((e) => e.id === selectedEventId)
    ? selectedEventId
    : null;
  const payables = validEventId
    ? await s.finance.getEventPromoterPayables(ctx, validEventId).catch(() => [])
    : [];
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
        description={`Cadastre promoters da organização, gere o link do relatório e defina cupons e comissões padrão — depois vincule às vendas de cada ${vocab.event}.`}
      />

      <div className="mb-6">
        <CreatePromoterForm orgId={orgId} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Promoters da organização" />
          {promoters.length === 0 ? (
            <EmptyState
              icon={<Users className="size-5" />}
              title="Nenhum afiliado cadastrado"
              description={`Cadastre o primeiro afiliado acima. Ele recebe um link de relatório próprio e pode ser vinculado a qualquer ${vocab.event}.`}
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

        {/* Commission payouts — moved here from the event's finance tab. */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Comissões a pagar"
            description={`Escolha ${vocab.theEvent} para ver o saldo devido a cada afiliado. Registrar o pagamento marca a comissão como paga (não movimenta dinheiro).`}
          />
          <CardBody className="border-b border-line">
            <div className="max-w-sm">
              <EventPayoutSelect vocab={vocab} events={eventOptions} selectedId={validEventId} />
            </div>
          </CardBody>
          {!validEventId ? (
            <EmptyState
              icon={<HandCoins className="size-5" />}
              title={`Selecione ${vocab.oneEvent}`}
              description={`As comissões são apuradas ${vocab.perEvent}. Escolha ${vocab.oneEvent} acima para ver o que está em aberto.`}
            />
          ) : payables.length === 0 ? (
            <EmptyState
              icon={<HandCoins className="size-5" />}
              title="Nenhuma comissão em aberto"
              description="Comissões acumulam automaticamente conforme vendas atribuídas a afiliados são pagas."
            />
          ) : (
            <ul className="divide-y divide-line">
              {payables.map((p) => (
                <li
                  key={p.promoterId}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{nameOf(p.promoterId)}</span>
                    <span className="text-small text-ink-muted">{fmtBRL(p.owedCents)} a pagar</span>
                  </span>
                  <PromoterPayoutButton
                    apiBase={`/api/orgs/${orgId}/events/${validEventId}`}
                    promoterId={p.promoterId}
                    promoterName={nameOf(p.promoterId)}
                    owedCents={p.owedCents}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Org-wide default coupons */}
        <Card>
          <CardHeader
            title="Cupons da organização"
            description={`Valem em ${vocab.allEvents.toLowerCase()}, salvo cupom específico ${vocab.ofEvent} com o mesmo código.`}
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
            description={`Regra aplicada a ${vocab.allEvents.toLowerCase()}, salvo regra específica ${vocab.ofEvent}.`}
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
                    {r.type === "PERCENT" ? commissionBaseLabel(r.base) : vocab.perTicketSold}
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
