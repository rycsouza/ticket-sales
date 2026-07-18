import type { Metadata } from "next";
import { Ticket } from "lucide-react";
import { Card, CardBody } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar — Ingressos" };

/** Staff login (FR-AUTH-001). Shared entry point for dashboard/checkin/finance. */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-brand text-brand-fg">
          <Ticket className="size-7" strokeWidth={2} />
        </span>
        <h1 className="text-h1 text-ink">Acesso da equipe</h1>
        <p className="mt-1 text-body text-ink-muted">
          Entre para gerenciar eventos, promoters, financeiro e portaria.
        </p>
      </header>
      <Card>
        <CardBody>
          <LoginForm />
        </CardBody>
      </Card>
    </main>
  );
}
