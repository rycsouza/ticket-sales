import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LayoutDashboard, ShieldCheck } from "lucide-react";
import { getPlatformServices } from "@/lib/services";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Plataforma — Admin",
  robots: { index: false, follow: false },
};

function feeLabel(bps: number, mode: "BUYER" | "PRODUCER"): string {
  return `${(bps / 100).toString()}% · ${mode === "BUYER" ? "comprador" : "produtora"}`;
}

/** Platform-admin home: every organization + its default fee (DEC-003). */
export default async function PlatformAdminPage() {
  await requirePlatformAdmin();
  const orgs = await getPlatformServices().identity.listAllOrganizationsAsPlatformAdmin();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader
        title="Administração da plataforma"
        description="Configuração de taxas e repasses. Acesso restrito a operadores da plataforma."
      />

      <Card className="mt-6">
        <CardHeader
          title="Organizações"
          description="Selecione uma organização para configurar a taxa padrão e os eventos."
          action={<Badge tone="brand"><ShieldCheck className="mr-1 inline size-3.5" />Admin</Badge>}
        />
        {orgs.length === 0 ? (
          <EmptyState title="Nenhuma organização" description="Ainda não há organizações cadastradas." />
        ) : (
          <ul className="divide-y divide-line">
            {orgs.map((org) => (
              <li key={org.id} className="flex items-center gap-2 px-5 py-3.5">
                <Link
                  href={`/plataforma/${org.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg transition-colors hover:bg-subtle"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{org.name}</span>
                    <span className="text-small text-ink-muted">
                      Taxa padrão: {feeLabel(org.defaultPlatformFeeBps, org.defaultFeeMode)}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-ink-muted" />
                </Link>
                <Link
                  href={`/painel/${org.slug}`}
                  title="Abrir painel da organização"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-small font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink"
                >
                  <LayoutDashboard className="size-4" />
                  Painel
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
