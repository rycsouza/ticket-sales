import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { DashboardHeader } from "../../../../header";
import { PayoutForm } from "./payout-form";

export const metadata: Metadata = { title: "Financeiro — Ingressos" };

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function FinancePage({
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
  let summary;
  try {
    summary = await getServices().finance.getEventFinancialSummary(ctx, eventId);
  } catch {
    // Finance is restricted to owner/admin/finance — show a friendly notice.
    return (
      <div className="mx-auto max-w-2xl">
        <DashboardHeader orgName={org.organization.name} orgId={orgId} />
        <main className="p-4">
          <Link href={`/painel/${orgId}/eventos/${eventId}`} className="text-sm text-brand-600">
            ← Evento
          </Link>
          <p className="mt-4 rounded-xl bg-white p-6 text-center text-sm text-ink-600 shadow-sm">
            Você não tem permissão para ver o financeiro deste evento.
          </p>
        </main>
      </div>
    );
  }

  const rows: [string, number, boolean?][] = [
    ["Vendas brutas", summary.grossSalesCents],
    ["Descontos", -summary.discountCents],
    ["Taxa da plataforma", summary.platformFeeCents],
    ["Comissões", -summary.commissionCents],
    ["Reembolsos", -summary.refundedCents],
    ["Repasses já registrados", -summary.payoutsCents],
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <DashboardHeader orgName={org.organization.name} orgId={orgId} />
      <main className="space-y-6 p-4">
        <div>
          <Link href={`/painel/${orgId}/eventos/${eventId}`} className="text-sm text-brand-600">
            ← Evento
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">Financeiro</h1>
        </div>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-brand-50 p-3">
              <p className="text-xs text-ink-400">A repassar (produtora)</p>
              <p className="text-xl font-bold text-brand-700">{brl(summary.producerPayableCents)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-ink-400">Receita líquida plataforma</p>
              <p className="text-xl font-bold text-ink-900">{brl(summary.platformNetCents)}</p>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {rows.map(([label, value]) => (
              <li key={label} className="flex justify-between py-2">
                <span className="text-ink-600">{label}</span>
                <span className={value < 0 ? "text-ink-400" : ""}>{brl(value)}</span>
              </li>
            ))}
            <li className="flex justify-between py-2 font-semibold">
              <span>Comissão a pagar (promoters)</span>
              <span>{brl(summary.promoterPayableCents)}</span>
            </li>
          </ul>
          <a
            href={`/api/orgs/${orgId}/events/${eventId}/finance/export`}
            className="mt-3 inline-block rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-ink-600 active:bg-slate-50"
          >
            Exportar extrato (CSV)
          </a>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-400">
            Registrar repasse externo
          </h2>
          <p className="mb-3 text-xs text-ink-400">
            O repasse é feito por fora (transferência manual). Aqui você registra o valor e a
            referência para conciliação — não movimenta dinheiro.
          </p>
          <PayoutForm apiBase={`/api/orgs/${orgId}/events/${eventId}`} />
        </section>
      </main>
    </div>
  );
}
