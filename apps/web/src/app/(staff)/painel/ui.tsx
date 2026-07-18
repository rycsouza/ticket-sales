"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui";

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
  leftIcon,
}: {
  url: string;
  method?: "POST" | "DELETE";
  body?: unknown;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
  confirmText?: string;
  leftIcon?: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={VARIANT_MAP[variant]}
        size={size}
        loading={busy}
        leftIcon={leftIcon}
        onClick={() => void run()}
      >
        {children}
      </Button>
      {error && <span className="text-small text-danger">{error}</span>}
    </span>
  );
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
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
      {copied ? "Copiado!" : label}
    </Button>
  );
}
