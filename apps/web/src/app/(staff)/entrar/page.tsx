import type { Metadata } from "next";
import { Ticket } from "lucide-react";
import { Card, CardBody } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar — Ingressos" };

const OAUTH_ERRORS: Record<string, string> = {
  google_indisponivel: "Login com Google não está disponível no momento.",
  google_falhou: "Não foi possível entrar com o Google. Tente novamente.",
};

/** Staff login (FR-AUTH-001). Shared entry point for dashboard/checkin/finance. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  // Read raw (not via loadServerEnv) so it never throws at build.
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);
  const oauthError = erro ? OAUTH_ERRORS[erro] : undefined;

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
          <LoginForm googleEnabled={googleEnabled} oauthError={oauthError} />
        </CardBody>
      </Card>
    </main>
  );
}
