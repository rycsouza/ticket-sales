"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function DashboardHeader({ orgName, orgId }: { orgName: string; orgId: string }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/entrar");
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">
            Ingressos
          </p>
          <p className="truncate text-sm font-bold text-ink-900">{orgName}</p>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href={`/painel/${orgId}`}
            className="rounded-lg px-3 py-1.5 font-medium text-ink-600 active:bg-slate-100"
          >
            Eventos
          </Link>
          <Link
            href="/checkin"
            className="rounded-lg px-3 py-1.5 font-medium text-ink-600 active:bg-slate-100"
          >
            Portaria
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg px-3 py-1.5 font-medium text-ink-400 active:bg-slate-100"
          >
            Sair
          </button>
        </nav>
      </div>
    </header>
  );
}
