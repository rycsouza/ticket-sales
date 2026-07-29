"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, UserPlus } from "lucide-react";
import { Alert, Button, Field, Input, PhoneInput } from "@/components/ui";
import { CopyButton } from "../../ui";

function reportLink(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/afiliado/${token}`;
}

/** Shows a freshly minted report link once — it can never be recovered later. */
function ReportTokenNotice({ token }: { token: string }) {
  return (
    <Alert tone="success">
      <div className="space-y-2">
        <p className="font-medium">Link do relatório do afiliado (copie agora — não será exibido de novo):</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1.5 text-small text-ink">
            {reportLink(token)}
          </code>
          <CopyButton text={reportLink(token)} label="Copiar" />
        </div>
      </div>
    </Alert>
  );
}

export function CreatePromoterForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (email.trim()) body.contactEmail = email.trim().toLowerCase();
      if (phone) body.contactPhone = phone;
      const res = await fetch(`/api/orgs/${orgId}/promoters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { reportToken?: string; error?: string };
      if (!res.ok || !data.reportToken) {
        setError(data.error ?? "Não foi possível cadastrar o afiliado.");
        return;
      }
      setCreatedToken(data.reportToken);
      setName("");
      setEmail("");
      setPhone("");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {createdToken && <ReportTokenNotice token={createdToken} />}
      {open ? (
        <form
          className="space-y-3 rounded-xl border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Nome do afiliado">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" maxLength={120} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="E-mail (opcional)">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="afiliado@email.com"
              />
            </Field>
            <Field label="WhatsApp (opcional)">
              <PhoneInput value={phone} onChange={setPhone} />
            </Field>
          </div>
          {error && <p className="text-small text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" loading={busy} disabled={name.trim().length < 2}>
              Cadastrar afiliado
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button leftIcon={<UserPlus className="size-4" />} onClick={() => setOpen(true)}>
          Novo afiliado
        </Button>
      )}
    </div>
  );
}

export function RegenerateReportButton({ orgId, promoterId }: { orgId: string; promoterId: string }) {
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/promoters/${promoterId}/report-token`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { reportToken?: string };
      if (res.ok && data.reportToken) setToken(data.reportToken);
    } finally {
      setBusy(false);
    }
  }

  if (token) {
    return (
      <CopyButton text={reportLink(token)} label="Copiar link do relatório" />
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      loading={busy}
      leftIcon={<KeyRound className="size-4" />}
      onClick={() => void regenerate()}
    >
      Gerar link do relatório
    </Button>
  );
}
