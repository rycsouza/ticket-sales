"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

/** Fires a mutation then refreshes the RSC data. Minimal, consistent styling. */
export function ActionButton({
  url,
  method = "POST",
  body,
  children,
  variant = "primary",
  confirmText,
}: {
  url: string;
  method?: "POST" | "DELETE";
  body?: unknown;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  confirmText?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classes =
    variant === "primary"
      ? "bg-brand-500 text-white active:bg-brand-600"
      : variant === "danger"
        ? "bg-red-50 text-red-700 active:bg-red-100"
        : "border border-slate-200 text-ink-600 active:bg-slate-50";

  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await apiSend(url, method, body);
      if (!ok) {
        setError(typeof data.error === "string" ? data.error : "Falha na operação.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${classes}`}
      >
        {busy ? "..." : children}
      </button>
      {error && <span className="mt-1 text-xs text-red-700">{error}</span>}
    </span>
  );
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-ink-600 active:bg-slate-50"
    >
      {copied ? "Copiado!" : label}
    </button>
  );
}
