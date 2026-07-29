import type { Metadata } from "next";
import { BarChart3, MousePointerClick, Receipt, Wallet } from "lucide-react";
import { hashToken } from "@ingressos/core";
import { getTenantServicesByRef } from "@/lib/services";

// Tokenized private report — never indexed, always fresh (the token is the key).
export const metadata: Metadata = { title: "Relatório do afiliado", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function AffiliateReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Multi-tenant: o hash do token de relatório resolve a org dona
  // (docs/MULTITENANT.md §3); token desconhecido cai no mesmo estado vazio.
  const report = await getTenantServicesByRef(
    "PROMOTER_REPORT",
    hashToken(decodeURIComponent(token)),
  )
    .then(({ services }) => services.promoters.getPromoterReportByToken(decodeURIComponent(token)))
    .catch(() => null);

  if (!report) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center px-4 text-center">
        <h1 className="text-h2 text-ink">Relatório indisponível</h1>
        <p className="mt-2 text-body text-ink-muted">
          Este link não é válido ou foi substituído. Peça um novo link ao organizador.
        </p>
      </main>
    );
  }

  const stats = [
    { label: "Cliques no link", value: report.clicks.toLocaleString("pt-BR"), icon: MousePointerClick },
    { label: "Pedidos atribuídos", value: report.attributedOrders.toLocaleString("pt-BR"), icon: Receipt },
    { label: "Ingressos com comissão", value: report.commissionQuantity.toLocaleString("pt-BR"), icon: BarChart3 },
    { label: "Comissão acumulada", value: fmtBRL(report.commissionAmountCents), icon: Wallet },
  ];

  return (
    <main className="mx-auto min-h-svh max-w-lg px-4 py-8">
      <p className="text-small font-semibold uppercase tracking-wide text-brand">Relatório do afiliado</p>
      <h1 className="mt-1 text-h1 text-ink">{report.promoter.name}</h1>
      <p className="mt-1 text-body text-ink-muted">Seu desempenho de divulgação e comissões.</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border border-line bg-surface p-4">
              <Icon className="size-5 text-ink-faint" />
              <p className="mt-2 text-h2 tabular-nums text-ink">{s.value}</p>
              <p className="text-small text-ink-muted">{s.label}</p>
            </div>
          );
        })}
      </div>

      {report.byEvent.length > 1 && (
        <div className="mt-6 rounded-xl border border-line bg-surface p-4">
          <p className="mb-2 text-small font-semibold text-ink">Comissão por evento</p>
          <ul className="space-y-1">
            {report.byEvent.map((e, i) => (
              <li key={e.eventId} className="flex justify-between text-body">
                <span className="text-ink-soft">Evento {i + 1}</span>
                <span className="tabular-nums text-ink">
                  {e.quantity} ingr. · <strong>{fmtBRL(e.amountCents)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-caption text-ink-faint">
        Os valores refletem pedidos pagos atribuídos a você. Comissões podem ser estornadas em caso de
        reembolso.
      </p>
    </main>
  );
}
