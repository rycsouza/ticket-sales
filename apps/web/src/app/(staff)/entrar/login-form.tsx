"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";

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
        router.push("/checkin");
        return;
      }
      setChallenge(String(data.challengeToken));
      if (data.status === "mfa_setup_required") {
        const setup = await post("/api/auth/mfa/setup", {
          challengeToken: data.challengeToken,
        });
        setSecret(String(setup.data.secret ?? ""));
        setOtpauthUri(String(setup.data.otpauthUri ?? ""));
        setStep("setup");
      } else {
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
      router.push("/checkin");
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "backup") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          Guarde estes <strong>códigos de backup</strong> num lugar seguro. Cada um funciona uma
          única vez, caso você perca o app autenticador.
        </div>
        <ul className="grid grid-cols-2 gap-2 rounded-lg bg-white p-4 font-mono text-sm shadow-sm">
          {backupCodes.map((c) => (
            <li key={c} className="tabular-nums">
              {c}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => router.push("/checkin")}
          className="w-full rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white active:bg-brand-600"
        >
          Guardei — continuar
        </button>
      </div>
    );
  }

  if (step === "setup" || step === "verify") {
    const isSetup = step === "setup";
    return (
      <div className="space-y-4">
        {isSetup && (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              Escaneie o QR com seu app autenticador (Google Authenticator, Authy, 1Password) e
              informe o código gerado.
            </p>
            {otpauthUri && (
              <div className="mx-auto w-fit rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <QRCode value={otpauthUri} size={168} />
              </div>
            )}
            {secret && (
              <p className="text-center text-xs text-ink-400">
                Chave manual: <span className="font-mono">{secret}</span>
              </p>
            )}
          </div>
        )}
        {!isSetup && (
          <p className="text-sm text-ink-600">
            Informe o código do seu app autenticador (ou um código de backup).
          </p>
        )}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-3 text-center text-lg tracking-widest outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          placeholder="000000"
          autoFocus
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
            className="h-4 w-4 accent-brand-500"
          />
          Confiar neste dispositivo por 30 dias
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy || code.trim().length < 6}
          onClick={() => submitCode(isSetup ? "/api/auth/mfa/confirm" : "/api/auth/mfa/verify")}
          className="w-full rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white active:bg-brand-600 disabled:opacity-50"
        >
          {busy ? "Verificando..." : isSetup ? "Ativar e entrar" : "Verificar"}
        </button>
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
      <label className="block">
        <span className="mb-1 block text-sm font-medium">E-mail</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          className="w-full rounded-lg border border-slate-200 px-3 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          placeholder="voce@produtora.com"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Senha</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full rounded-lg border border-slate-200 px-3 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          placeholder="Sua senha"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || email.length === 0 || password.length === 0}
        className="w-full rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white shadow-lg shadow-blue-200 active:bg-brand-600 disabled:opacity-50"
      >
        {busy ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
