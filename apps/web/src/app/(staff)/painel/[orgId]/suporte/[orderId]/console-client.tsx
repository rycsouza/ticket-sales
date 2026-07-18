"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend } from "../../../ui";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

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
        className={input}
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Anotar contato, decisão, etc."
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || body.trim().length === 0}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white active:bg-brand-600 disabled:opacity-40"
      >
        {busy ? "..." : "Adicionar nota"}
      </button>
    </form>
  );
}

type Panel = "block" | "transfer" | "participant" | null;

/**
 * FR-ADM-004/FR-TKT-007/012 — per-ticket support operations. Blocked tickets
 * can be unblocked; every action requires the operator's explicit input.
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

  // Fields (shared across panels; only the relevant ones are sent).
  const [justification, setJustification] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const canBlock = status === "ISSUED" || status === "VALID";
  const canUnblock = status === "BLOCKED";
  const canTransfer = status === "ISSUED" || status === "VALID";

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

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap gap-2">
        {canBlock && <Chip onClick={() => setPanel(panel === "block" ? null : "block")}>Bloquear</Chip>}
        {canUnblock && (
          <Chip
            variant="danger"
            onClick={() => setPanel(panel === "block" ? null : "block")}
          >
            Desbloquear
          </Chip>
        )}
        {canTransfer && (
          <Chip onClick={() => setPanel(panel === "transfer" ? null : "transfer")}>Transferir</Chip>
        )}
        <Chip onClick={() => setPanel(panel === "participant" ? null : "participant")}>
          Corrigir titular
        </Chip>
      </div>

      {transferPath && (
        <p className="mt-2 break-all rounded-lg bg-green-50 p-2 text-xs text-green-800">
          Novo link do ingresso: <span className="font-mono">{transferPath}</span> — entregue ao novo
          titular. O link anterior foi invalidado.
        </p>
      )}

      {panel === "block" && (
        <div className="mt-2 space-y-2">
          <input
            className={input}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Justificativa (mín. 5 caracteres)"
          />
          <Submit
            busy={busy}
            disabled={justification.trim().length < 5}
            onClick={() =>
              void run(`${base}/status`, {
                action: canUnblock ? "unblock" : "block",
                justification: justification.trim(),
              })
            }
          >
            {canUnblock ? "Confirmar desbloqueio" : "Confirmar bloqueio"}
          </Submit>
        </div>
      )}

      {panel === "transfer" && (
        <div className="mt-2 space-y-2">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do novo titular" />
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail do novo titular" />
          <Submit
            busy={busy}
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
          </Submit>
        </div>
      )}

      {panel === "participant" && (
        <div className="mt-2 space-y-2">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (opcional)" />
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail (opcional)" />
          <Submit
            busy={busy}
            disabled={name.trim().length === 0 && email.trim().length === 0}
            onClick={() =>
              void run(`${base}/participant`, {
                ...(name.trim() ? { participantName: name.trim() } : {}),
                ...(email.trim() ? { participantEmail: email.trim() } : {}),
              })
            }
          >
            Salvar correção
          </Submit>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function Chip({
  children,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold active:bg-slate-50 ${
        variant === "danger"
          ? "border-red-200 text-red-700"
          : "border-slate-200 text-ink-600"
      }`}
    >
      {children}
    </button>
  );
}

function Submit({
  children,
  onClick,
  busy,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white active:bg-brand-600 disabled:opacity-40"
    >
      {busy ? "..." : children}
    </button>
  );
}
