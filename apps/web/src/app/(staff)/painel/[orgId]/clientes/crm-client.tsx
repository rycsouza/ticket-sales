"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { pluralize } from "@/lib/format";

/**
 * Export dialog. The endpoint only accepts the segment filters
 * (event scope + include-opted-out) and always writes a fixed column set, so
 * the dialog exposes exactly those options — no field picker is invented.
 */
export function ExportBuyersDialog({
  orgId,
  eventId,
  estimated,
}: {
  orgId: string;
  eventId?: string | undefined;
  estimated: number;
}) {
  const [open, setOpen] = useState(false);
  const [includeOptedOut, setIncludeOptedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportCsv() {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { includeOptedOut };
      if (eventId) body.eventId = eventId;
      const res = await fetch(`/api/orgs/${orgId}/customers/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("Não foi possível gerar a exportação. Tente novamente.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "compradores.csv";
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch {
      setError("Falha de conexão ao exportar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        leftIcon={<Download className="size-[18px]" />}
        onClick={() => setOpen(true)}
      >
        Exportar compradores
      </Button>
      <Modal
        open={open}
        onClose={() => (busy ? undefined : setOpen(false))}
        title="Exportar compradores"
        description={
          eventId ? "Apenas os compradores do evento selecionado." : "Todos os compradores da produtora."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button loading={busy} onClick={() => void exportCsv()}>
              {busy ? "Preparando exportação" : "Exportar CSV"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-small text-ink-muted">
            {pluralize(estimated, "comprador será exportado", "compradores serão exportados")} (filtro
            atual). O arquivo inclui: e-mail, nome, telefone, pedidos, total comprado e status de
            comunicação.
          </p>
          <label className="flex items-center gap-2 text-body text-ink-soft">
            <input
              type="checkbox"
              checked={includeOptedOut}
              onChange={(e) => setIncludeOptedOut(e.target.checked)}
              className="size-4 accent-brand"
            />
            Incluir compradores com comunicações desativadas
          </label>
          {error && <p className="text-small text-danger">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
