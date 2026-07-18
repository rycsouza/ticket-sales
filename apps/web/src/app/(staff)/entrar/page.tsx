import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar — Ingressos" };

/** Staff login (FR-AUTH-001). Shared entry point for dashboard/checkin/finance. */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Ingressos</p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900">Acesso da equipe</h1>
        <p className="mt-1 text-sm text-ink-400">
          Entre para gerenciar eventos, promoters, financeiro e portaria.
        </p>
      </header>
      <LoginForm />
    </main>
  );
}
