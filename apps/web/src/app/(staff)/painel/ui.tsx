"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { Button, Field, Modal, Select, Textarea, type ButtonVariant } from "@/components/ui";

/** Reusable "filter by event" dropdown that drives navigation via the query string. */
export function EventFilterSelect({
  basePath,
  events,
  selected,
  allLabel = "Todos os eventos",
  ariaLabel = "Filtrar por evento",
}: {
  basePath: string;
  events: { id: string; title: string }[];
  selected: string;
  allLabel?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  return (
    <Select
      aria-label={ariaLabel}
      value={selected}
      onChange={(e) => {
        const value = e.target.value;
        router.push(value ? `${basePath}?evento=${value}` : basePath);
      }}
    >
      <option value="">{allLabel}</option>
      {events.map((ev) => (
        <option key={ev.id} value={ev.id}>
          {ev.title}
        </option>
      ))}
    </Select>
  );
}

export async function apiSend(
  url: string,
  method: "POST" | "DELETE",
  body?: unknown,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

const VARIANT_MAP: Record<"primary" | "secondary" | "danger", ButtonVariant> = {
  primary: "primary",
  secondary: "outline",
  danger: "destructive",
};

/** Fires a mutation then refreshes the RSC data. */
export function ActionButton({
  url,
  method = "POST",
  body,
  children,
  variant = "primary",
  size = "sm",
  confirmText,
  confirmTitle,
  confirmLabel,
  leftIcon,
}: {
  url: string;
  method?: "POST" | "DELETE";
  body?: unknown;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
  /** When set, clicking opens a custom confirmation dialog with this message. */
  confirmText?: string;
  confirmTitle?: string;
  confirmLabel?: string;
  leftIcon?: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function run(): Promise<{ ok: boolean; error?: string }> {
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await apiSend(url, method, body);
      if (!ok) {
        const msg = typeof data.error === "string" ? data.error : "Falha na operação.";
        setError(msg);
        return { ok: false, error: msg };
      }
      router.refresh();
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={VARIANT_MAP[variant]}
        size={size}
        loading={busy}
        leftIcon={leftIcon}
        onClick={() => (confirmText ? setConfirmOpen(true) : void run())}
      >
        {children}
      </Button>
      {error && <span className="text-small text-danger">{error}</span>}
      {confirmText && (
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={confirmTitle ?? "Confirmar ação"}
          description={confirmText}
          confirmLabel={confirmLabel ?? "Confirmar"}
          tone={variant === "danger" ? "danger" : "primary"}
          onConfirm={run}
        />
      )}
    </span>
  );
}

/**
 * Confirmation dialog for consequential actions. Explains the consequence,
 * optionally collects a justification (some transitions require one), and runs
 * the async action. Modal handles focus + Escape + overlay dismissal.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Confirmar",
  tone = "primary",
  justification,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  justification?: { label: string; required?: boolean; placeholder?: string } | undefined;
  onConfirm: (justification?: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setReason("");
    setError(null);
    onClose();
  }

  async function run() {
    setError(null);
    setBusy(true);
    try {
      const result = await onConfirm(justification ? reason.trim() : undefined);
      if (!result.ok) {
        setError(result.error ?? "Não foi possível concluir a operação.");
        return;
      }
      setReason("");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const justifyTooShort =
    !!justification?.required && reason.trim().length < 5;

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant={tone === "danger" ? "destructive" : "primary"}
            loading={busy}
            disabled={justifyTooShort}
            onClick={() => void run()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4" aria-live="polite">
        {description && <div className="text-body text-ink-soft">{description}</div>}
        {justification && (
          <Field
            label={justification.label}
            htmlFor="confirm-justification"
            required={justification.required}
            hint={justification.required ? "Mínimo de 5 caracteres." : undefined}
          >
            <Textarea
              id="confirm-justification"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={justification.placeholder}
            />
          </Field>
        )}
        {error && <p className="text-small text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

export function CopyButton({
  text,
  label = "Copiar",
  copiedLabel = "Link copiado",
  variant = "outline",
  size = "sm",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant={variant}
        size={size}
        leftIcon={
          copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />
        }
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? copiedLabel : label}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </span>
  );
}
