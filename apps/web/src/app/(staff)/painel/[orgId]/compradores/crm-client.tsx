"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CrmExportButton({ orgId }: { orgId: string }) {
  const [busy, setBusy] = useState(false);

  async function exportCsv() {
    setBusy(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/customers/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeOptedOut: false }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "compradores.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void exportCsv()}
      disabled={busy}
      className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-ink-600 active:bg-slate-50 disabled:opacity-50"
    >
      {busy ? "..." : "Exportar CSV"}
    </button>
  );
}

export function OptOutButton({
  orgId,
  email,
  optedOut,
}: {
  orgId: string;
  email: string;
  optedOut: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/customers/opt-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, optedOut: !optedOut }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-ink-600 active:bg-slate-50 disabled:opacity-50"
    >
      {optedOut ? "Reativar" : "Opt-out"}
    </button>
  );
}
