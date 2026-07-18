import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { requireDashboardUser } from "@/lib/dashboard";
import { NewOrgForm } from "./org-forms";

export const metadata: Metadata = { title: "Painel — Ingressos" };

/** Organization resolver: single org → straight to its workspace. */
export default async function PainelHome() {
  const { userId } = await requireDashboardUser();
  const orgs = await getServices().identity.listMyOrganizations(userId);

  if (orgs.length === 1) redirect(`/painel/${orgs[0]!.organization.id}`);

  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Ingressos</p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900">Suas organizações</h1>
      </header>

      {orgs.length > 0 ? (
        <ul className="space-y-2">
          {orgs.map(({ organization, role }) => (
            <li key={organization.id}>
              <Link
                href={`/painel/${organization.id}`}
                className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm active:bg-slate-50"
              >
                <span className="font-medium">{organization.name}</span>
                <span className="text-xs uppercase tracking-wide text-ink-400">{role}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-400">
          Você ainda não faz parte de nenhuma organização. Crie a primeira:
        </p>
      )}

      <NewOrgForm />
    </main>
  );
}
