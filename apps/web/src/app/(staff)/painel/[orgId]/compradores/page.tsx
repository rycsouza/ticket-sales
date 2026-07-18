import type { Metadata } from "next";
import { Users } from "lucide-react";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { Badge, Card, CardBody, EmptyState, PageHeader, Stat } from "@/components/ui";
import { fmtBRL } from "@/lib/status";
import { CrmExportButton, OptOutButton } from "./crm-client";

export const metadata: Metadata = { title: "Compradores — Ingressos" };

export default async function CrmPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);

  let segment;
  try {
    segment = await getServices().customers.getSegment(ctx, { includeOptedOut: true });
  } catch {
    return (
      <>
        <PageHeader title="Compradores" />
        <Card>
          <CardBody>
            <p className="text-body text-ink-muted">
              Você não tem permissão para ver os compradores desta organização.
            </p>
          </CardBody>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Compradores"
        description="Base construída automaticamente a cada pedido pago."
        actions={<CrmExportButton orgId={orgId} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:max-w-md">
        <Stat label="Pessoas" value={segment.count.toLocaleString("pt-BR")} />
        <Stat label="Em compras" value={fmtBRL(segment.totalSpentCents)} />
      </div>

      <Card>
        {segment.customers.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="Nenhum comprador ainda"
            description="A base é preenchida automaticamente a cada pedido pago."
          />
        ) : (
          <ul className="divide-y divide-line">
            {segment.customers.map((c) => (
              <li key={c.email} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-body font-medium text-ink">
                    {c.name ?? c.email}
                  </span>
                  <span className="block truncate text-small text-ink-muted">
                    {c.email} · {c.orderCount} pedido(s) · {fmtBRL(c.totalSpentCents)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {c.optedOut && <Badge tone="warning">opt-out</Badge>}
                  <OptOutButton orgId={orgId} email={c.email} optedOut={c.optedOut} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-small text-ink-muted">
        A base respeita consentimento e opt-out (LGPD). Compradores inativos por mais de 24 meses são
        anonimizados automaticamente.
      </p>
    </>
  );
}
