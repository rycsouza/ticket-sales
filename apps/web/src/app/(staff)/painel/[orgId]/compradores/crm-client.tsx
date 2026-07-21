"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button, Select } from "@/components/ui";

export function EventFilter({
  orgId,
  events,
  selected,
}: {
  orgId: string;
  events: { id: string; title: string }[];
  selected: string;
}) {
  const router = useRouter();
  return (
    <Select
      aria-label="Filtrar compradores por evento"
      value={selected}
      onChange={(e) => {
        const value = e.target.value;
        router.push(
          value ? `/painel/${orgId}/compradores?evento=${value}` : `/painel/${orgId}/compradores`,
        );
      }}
    >
      <option value="">Todos os eventos</option>
      {events.map((ev) => (
        <option key={ev.id} value={ev.id}>
          {ev.title}
        </option>
      ))}
    </Select>
  );
}

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
    <Button
      variant="outline"
      loading={busy}
      leftIcon={<Download className="size-[18px]" />}
      onClick={() => void exportCsv()}
    >
      Exportar CSV
    </Button>
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
    <Button variant="outline" size="sm" loading={busy} onClick={() => void toggle()}>
      {optedOut ? "Reativar" : "Opt-out"}
    </Button>
  );
}
