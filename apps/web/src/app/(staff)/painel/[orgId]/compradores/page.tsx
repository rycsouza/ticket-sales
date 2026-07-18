import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { DashboardHeader } from "../../header";
import { CrmExportButton, OptOutButton } from "./crm-client";

export const metadata: Metadata = { title: "Compradores — Ingressos" };

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function CrmPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { userId } = await requireDashboardUser();
  const orgs = await getServices().identity.listMyOrganizations(userId);
  const org = orgs.find((o) => o.organization.id === orgId);
  if (!org) redirect("/painel");

  const ctx = dashboardCtx(orgId, userId);
  let segment;
  try {
    segment = await getServices().customers.getSegment(ctx, { includeOptedOut: true });
  } catch {
    return (
      <div className="mx-auto max-w-2xl">
        <DashboardHeader orgName={org.organization.name} orgId={orgId} />
        <main className="p-4">
          <p className="rounded-xl bg-white p-6 text-center text-sm text-ink-600 shadow-sm">
            Você não tem permissão para ver os compradores desta organização.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <DashboardHeader orgName={org.organization.name} orgId={orgId} />
      <main className="space-y-6 p-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Compradores</h1>
            <p className="text-sm text-ink-400">
              {segment.count} pessoas · {brl(segment.totalSpentCents)} em compras
            </p>
          </div>
          <CrmExportButton orgId={orgId} />
        </div>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          {segment.customers.length === 0 ? (
            <p className="text-sm text-ink-400">
              Nenhum comprador ainda. A base é preenchida automaticamente a cada pedido pago.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {segment.customers.map((c) => (
                <li key={c.email} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {c.name ?? c.email}
                    </span>
                    <span className="block truncate text-xs text-ink-400">
                      {c.email} · {c.orderCount} pedido(s) · {brl(c.totalSpentCents)}
                      {c.optedOut ? " · opt-out" : ""}
                    </span>
                  </span>
                  <OptOutButton orgId={orgId} email={c.email} optedOut={c.optedOut} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-ink-400">
          A base respeita consentimento e opt-out (LGPD). Compradores inativos por mais de 24 meses
          são anonimizados automaticamente.
        </p>
      </main>
    </div>
  );
}
