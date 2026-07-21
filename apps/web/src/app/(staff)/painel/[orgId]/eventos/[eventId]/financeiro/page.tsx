import type { Metadata } from "next";
import { Download } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { Alert, Card, CardBody, CardHeader, Stat, buttonVariants } from "@/components/ui";
import { fmtBRL } from "@/lib/status";
import { PayoutForm } from "./payout-form";

export const metadata: Metadata = { title: "Financeiro — Ingressos" };

export default async function FinancePage({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId, eventId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);

  let summary;
  try {
    summary = await getServices().finance.getEventFinancialSummary(ctx, eventId);
  } catch {
    return (
      <Card>
        <CardBody>
          <Alert tone="neutral">
            Você não tem permissão para ver o financeiro deste evento.
          </Alert>
        </CardBody>
      </Card>
    );
  }

  // Producer-facing composition. Each line has a real ledger source; the
  // authoritative balance is `producerPayableCents`.
  const composition: { label: string; value: number; hint: string; negative?: boolean }[] = [
    { label: "Vendas brutas", value: summary.grossSalesCents, hint: "Total vendido antes de taxas e descontos." },
    { label: "Descontos", value: -summary.discountCents, hint: "Cupons e promoções aplicados." },
    { label: "Taxas da plataforma", value: -summary.platformFeeCents, hint: "Taxa de serviço da plataforma." },
    { label: "Custos de pagamento", value: -summary.pspCostCents, hint: "Custos do meio de pagamento (Pix, cartão)." },
    { label: "Comissões", value: -summary.commissionCents, hint: "Comissões acumuladas dos promotores." },
    { label: "Reembolsos", value: -summary.refundedCents, hint: "Valores devolvidos aos compradores." },
    { label: "Repasses já registrados", value: -summary.payoutsCents, hint: "Pagamentos externos já registrados." },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-h2 text-ink">Financeiro</h2>
          <p className="mt-0.5 text-small text-ink-muted">
            Acompanhe vendas, taxas, comissões, reembolsos e valores a receber deste evento.
          </p>
        </div>
        <a
          href={`/api/orgs/${orgId}/events/${eventId}/finance/export`}
          className={buttonVariants({ variant: "outline", size: "md" })}
        >
          <Download className="size-[18px]" />
          Exportar extrato (CSV)
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Saldo a receber"
          value={fmtBRL(summary.producerPayableCents)}
          hint="Valor do evento ainda a repassar à produtora"
          tone={summary.producerPayableCents > 0 ? "success" : "neutral"}
        />
        <Stat
          label="Já repassado"
          value={fmtBRL(summary.payoutsCents)}
          hint="Repasses externos já registrados"
        />
        <Stat
          label="Comissões a pagar"
          value={fmtBRL(summary.promoterPayableCents)}
          hint="Total devido aos promotores"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Composição do resultado"
            description="Do total vendido até o saldo a receber."
          />
          <CardBody>
            <ul className="divide-y divide-line">
              {composition.map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-body">
                  <span className="text-ink-soft" title={row.hint}>
                    {row.label}
                  </span>
                  <span
                    className={
                      row.value < 0 ? "tabular-nums text-ink-muted" : "tabular-nums text-ink"
                    }
                  >
                    {row.value < 0 ? `− ${fmtBRL(Math.abs(row.value))}` : fmtBRL(row.value)}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 pt-3 text-body font-semibold">
                <span className="text-ink">Saldo a receber</span>
                <span className="tabular-nums text-ink">{fmtBRL(summary.producerPayableCents)}</span>
              </li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Registrar repasse externo"
            description="Informa ao sistema um pagamento feito por fora — não movimenta dinheiro."
          />
          <CardBody>
            <PayoutForm apiBase={`/api/orgs/${orgId}/events/${eventId}`} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
