"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, PencilLine, ShieldCheck, ArrowLeftRight } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { apiSend } from "../../../ui";

/** FR-ADM-009 — add an internal note to the order. */
export function NoteForm({ orgId, orderId }: { orgId: string; orderId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const { ok, data } = await apiSend(`/api/orgs/${orgId}/orders/${orderId}/notes`, "POST", {
        body: body.trim(),
      });
      if (!ok) {
        setError(typeof data.error === "string" ? data.error : "Falha ao salvar.");
        return;
      }
      setBody("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Anotar contato, decisão, etc."
        className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:outline-none"
      />
      {error && <p className="text-small text-danger">{error}</p>}
      <Button type="submit" size="sm" loading={busy} disabled={body.trim().length === 0}>
        Adicionar nota
      </Button>
    </form>
  );
}

type Panel = "block" | "transfer" | "participant" | null;

/**
 * FR-ADM-004 / FR-TKT-007 / FR-TKT-012 — per-ticket support operations.
 * Available actions follow the ticket state machine.
 */
export function TicketActions({
  orgId,
  ticketId,
  status,
}: {
  orgId: string;
  ticketId: string;
  status: string;
}) {
  const router = useRouter();
  const base = `/api/orgs/${orgId}/tickets/${ticketId}`;
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferPath, setTransferPath] = useState<string | null>(null);

  const [justification, setJustification] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const canBlock = status === "VALID" || status === "PENDING_ISSUE";
  const canUnblock = status === "BLOCKED";
  const canTransfer = status === "VALID";
  const canCorrect = status === "VALID" || status === "BLOCKED" || status === "PENDING_ISSUE";

  function toggle(next: Panel) {
    setError(null);
    setPanel((p) => (p === next ? null : next));
  }

  async function run(url: string, payload: unknown, onOk?: (data: Record<string, unknown>) => void) {
    setError(null);
    setBusy(true);
    try {
      const { ok, data } = await apiSend(url, "POST", payload);
      if (!ok) {
        setError(typeof data.error === "string" ? data.error : "Falha na operação.");
        return;
      }
      onOk?.(data);
      setPanel(null);
      setJustification("");
      setName("");
      setEmail("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const hasAction = canBlock || canUnblock || canTransfer || canCorrect;
  if (!hasAction) return null;

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap gap-2">
        {canBlock && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Ban className="size-4" />}
            onClick={() => toggle("block")}
          >
            Bloquear
          </Button>
        )}
        {canUnblock && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ShieldCheck className="size-4" />}
            onClick={() => toggle("block")}
          >
            Desbloquear
          </Button>
        )}
        {canTransfer && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ArrowLeftRight className="size-4" />}
            onClick={() => toggle("transfer")}
          >
            Transferir
          </Button>
        )}
        {canCorrect && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<PencilLine className="size-4" />}
            onClick={() => toggle("participant")}
          >
            Corrigir titular
          </Button>
        )}
      </div>

      {transferPath && (
        <p className="mt-2 break-all rounded-lg border border-success-border bg-success-bg p-2 text-small text-success-text">
          Novo link do ingresso: <span className="font-mono">{transferPath}</span> — entregue ao
          novo titular. O link anterior foi invalidado.
        </p>
      )}

      {panel === "block" && (
        <div className="mt-3 space-y-2">
          <Field label="Justificativa" htmlFor={`just-${ticketId}`}>
            <Input
              id={`just-${ticketId}`}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Mínimo 5 caracteres"
            />
          </Field>
          <Button
            size="sm"
            variant={canUnblock ? "primary" : "destructive"}
            loading={busy}
            disabled={justification.trim().length < 5}
            onClick={() =>
              void run(`${base}/status`, {
                action: canUnblock ? "unblock" : "block",
                justification: justification.trim(),
              })
            }
          >
            {canUnblock ? "Confirmar desbloqueio" : "Confirmar bloqueio"}
          </Button>
        </div>
      )}

      {panel === "transfer" && (
        <div className="mt-3 space-y-2">
          <Field label="Novo titular" htmlFor={`tn-${ticketId}`}>
            <Input
              id={`tn-${ticketId}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome"
            />
          </Field>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
          />
          <Button
            size="sm"
            loading={busy}
            disabled={name.trim().length < 2 || !email.includes("@")}
            onClick={() =>
              void run(
                `${base}/transfer`,
                { participantName: name.trim(), participantEmail: email.trim() },
                (data) => {
                  if (typeof data.ticketPath === "string") setTransferPath(data.ticketPath);
                },
              )
            }
          >
            Confirmar transferência
          </Button>
        </div>
      )}

      {panel === "participant" && (
        <div className="mt-3 space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (opcional)" />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail (opcional)"
          />
          <Button
            size="sm"
            loading={busy}
            disabled={name.trim().length === 0 && email.trim().length === 0}
            onClick={() =>
              void run(`${base}/participant`, {
                ...(name.trim() ? { participantName: name.trim() } : {}),
                ...(email.trim() ? { participantEmail: email.trim() } : {}),
              })
            }
          >
            Salvar correção
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-small text-danger">{error}</p>}
    </div>
  );
}
