import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import {
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Stat,
  buttonVariants,
} from "@/components/ui";
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
  const backHref = `/painel/${orgId}/eventos/${eventId}`;

  let summary;
  try {
    summary = await getServices().finance.getEventFinancialSummary(ctx, eventId);
  } catch {
    return (
      <>
        <BackLink href={backHref} />
        <PageHeader title="Financeiro" />
        <Card>
          <CardBody>
            <p className="text-body text-ink-muted">
              Você não tem permissão para ver o financeiro deste evento.
            </p>
          </CardBody>
        </Card>
      </>
    );
  }

  const rows: [string, number][] = [
    ["Vendas brutas", summary.grossSalesCents],
    ["Descontos", -summary.discountCents],
    ["Taxa da plataforma", summary.platformFeeCents],
    ["Comissões", -summary.commissionCents],
    ["Reembolsos", -summary.refundedCents],
    ["Repasses já registrados", -summary.payoutsCents],
  ];

  return (
    <>
      <BackLink href={backHref} />
      <PageHeader
        title="Financeiro"
        description="Reproduzível do ledger imutável. Repasses e comissões são registrados manualmente."
        actions={
          <a
            href={`/api/orgs/${orgId}/events/${eventId}/finance/export`}
            className={buttonVariants({ variant: "outline", size: "md" })}
          >
            <Download className="size-[18px]" />
            Exportar extrato (CSV)
          </a>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="A repassar (produtora)" value={fmtBRL(summary.producerPayableCents)} />
        <Stat label="Receita líquida plataforma" value={fmtBRL(summary.platformNetCents)} />
        <Stat label="Comissão a pagar (promoters)" value={fmtBRL(summary.promoterPayableCents)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Detalhamento" />
          <CardBody>
            <ul className="divide-y divide-line">
              {rows.map(([label, value]) => (
                <li key={label} className="flex justify-between py-2.5 text-body">
                  <span className="text-ink-soft">{label}</span>
                  <span
                    className={
                      value < 0
                        ? "tabular-nums text-ink-muted"
                        : "tabular-nums text-ink"
                    }
                  >
                    {fmtBRL(value)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Registrar repasse externo"
            description="Registra valor e referência para conciliação — não movimenta dinheiro."
          />
          <CardBody>
            <PayoutForm apiBase={`/api/orgs/${orgId}/events/${eventId}`} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 text-small font-medium text-brand hover:underline"
    >
      <ArrowLeft className="size-4" />
      Evento
    </Link>
  );
}
