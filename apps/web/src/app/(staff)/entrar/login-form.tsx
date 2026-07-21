"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { Button, Field, Input } from "@/components/ui";

type Step = "credentials" | "setup" | "verify" | "backup";

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA state
  const [challenge, setChallenge] = useState("");
  const [secret, setSecret] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  // Which second factor is in play on the verify step.
  const [channel, setChannel] = useState<"totp" | "email">("totp");
  const verifyUrl = channel === "email" ? "/api/auth/email-2fa/verify" : "/api/auth/mfa/verify";

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  }

  async function submitCredentials() {
    setError(null);
    setBusy(true);
    try {
      const { ok, data } = await post("/api/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });
      if (!ok) {
        setError("E-mail ou senha inválidos.");
        return;
      }
      if (data.status === "authenticated") {
        router.push("/painel");
        return;
      }
      setChallenge(String(data.challengeToken));
      if (data.status === "mfa_setup_required") {
        const setup = await post("/api/auth/mfa/setup", { challengeToken: data.challengeToken });
        setSecret(String(setup.data.secret ?? ""));
        setOtpauthUri(String(setup.data.otpauthUri ?? ""));
        setStep("setup");
      } else if (data.status === "email_2fa_required") {
        setChannel("email");
        setStep("verify");
      } else {
        setChannel("totp");
        setStep("verify");
      }
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(url: string) {
    setError(null);
    setBusy(true);
    try {
      const { ok, data } = await post(url, {
        challengeToken: challenge,
        code: code.trim(),
        trustDevice,
      });
      if (!ok) {
        setError("Código inválido. Tente novamente.");
        return;
      }
      if (Array.isArray(data.backupCodes) && data.backupCodes.length > 0) {
        setBackupCodes(data.backupCodes as string[]);
        setStep("backup");
        return;
      }
      router.push("/painel");
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const errorBox = error && (
    <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-small text-danger-text">
      {error}
    </p>
  );

  if (step === "backup") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-warning-border bg-warning-bg p-3 text-small text-warning-text">
          Guarde estes <strong>códigos de backup</strong> num lugar seguro. Cada um funciona uma
          única vez, caso você perca o app autenticador.
        </div>
        <ul className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-subtle p-4 font-mono text-body">
          {backupCodes.map((c) => (
            <li key={c} className="tabular-nums text-ink">
              {c}
            </li>
          ))}
        </ul>
        <Button size="lg" className="w-full" onClick={() => router.push("/painel")}>
          Guardei — continuar
        </Button>
      </div>
    );
  }

  if (step === "setup" || step === "verify") {
    const isSetup = step === "setup";
    return (
      <div className="space-y-4">
        {isSetup ? (
          <div className="space-y-3">
            <p className="text-body text-ink-soft">
              Escaneie o QR com seu app autenticador (Google Authenticator, Authy, 1Password) e
              informe o código gerado.
            </p>
            {otpauthUri && (
              <div className="mx-auto w-fit rounded-xl border border-line bg-surface p-3">
                <QRCode value={otpauthUri} size={168} />
              </div>
            )}
            {secret && (
              <p className="text-center text-small text-ink-muted">
                Chave manual: <span className="font-mono">{secret}</span>
              </p>
            )}
          </div>
        ) : channel === "email" ? (
          <p className="text-body text-ink-soft">
            Enviamos um código de 6 dígitos para o seu e-mail. Informe-o abaixo para entrar. O
            código expira em 10 minutos.
          </p>
        ) : (
          <p className="text-body text-ink-soft">
            Informe o código do seu app autenticador (ou um código de backup).
          </p>
        )}
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="h-12 text-center text-lg tracking-widest"
          placeholder="000000"
          autoFocus
        />
        <label className="flex items-center gap-2 text-body text-ink-soft">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
            className="size-4 accent-brand"
          />
          Confiar neste dispositivo por 30 dias
        </label>
        {errorBox}
        <Button
          size="lg"
          className="w-full"
          loading={busy}
          disabled={code.trim().length < 6}
          onClick={() => submitCode(isSetup ? "/api/auth/mfa/confirm" : verifyUrl)}
        >
          {isSetup ? "Ativar e entrar" : "Verificar"}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submitCredentials();
      }}
    >
      <Field label="E-mail" htmlFor="login-email">
        <Input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          placeholder="voce@produtora.com"
        />
      </Field>
      <Field label="Senha" htmlFor="login-password">
        <Input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="Sua senha"
        />
      </Field>
      {errorBox}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={busy}
        disabled={email.length === 0 || password.length === 0}
      >
        Entrar
      </Button>
    </form>
  );
}
