import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Ticket } from "lucide-react";
import { getServices } from "@/lib/services";
import { requireDashboardUser } from "@/lib/dashboard";
import { Badge } from "@/components/ui";
import { NewOrgForm } from "./org-forms";

export const metadata: Metadata = { title: "Painel — Ingressos" };

/** Organization resolver: single org → straight to its workspace. */
export default async function PainelHome() {
  const { userId } = await requireDashboardUser();
  const orgs = await getServices().identity.listMyOrganizations(userId);

  if (orgs.length === 1) redirect(`/painel/${orgs[0]!.organization.id}`);

  return (
    <div className="min-h-dvh bg-page">
      <header className="flex h-16 items-center border-b border-line bg-surface px-4 lg:px-8">
        <span className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-fg">
            <Ticket className="size-5" strokeWidth={2} />
          </span>
          <span className="text-h3 font-semibold text-ink">Ingressos</span>
        </span>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-4 py-10">
        <div>
          <h1 className="text-h1 text-ink">Suas organizações</h1>
          <p className="mt-1 text-body text-ink-muted">
            Selecione uma produtora para entrar no painel.
          </p>
        </div>

        {orgs.length > 0 ? (
          <ul className="space-y-2">
            {orgs.map(({ organization, role }) => (
              <li key={organization.id}>
                <Link
                  href={`/painel/${organization.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-hover"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {organization.name}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone="neutral">{role}</Badge>
                    <ChevronRight className="size-4 text-ink-faint" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-ink-muted">
            Você ainda não faz parte de nenhuma organização. Crie a primeira:
          </p>
        )}

        <NewOrgForm />
      </main>
    </div>
  );
}
