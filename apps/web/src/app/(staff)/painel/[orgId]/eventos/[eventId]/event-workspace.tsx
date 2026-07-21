"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronDown,
  Rocket,
  Settings2,
  XCircle,
} from "lucide-react";
import { Button, Menu, MenuItem, MenuLabel } from "@/components/ui";
import { EVENT_STATUS, statusMeta } from "@/lib/status";
import { apiSend, ConfirmDialog } from "../../../ui";

type EventStatus = string;

interface ActionDef {
  action: string;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  tone: "primary" | "danger";
  justification?: { label: string; required: boolean; placeholder?: string };
}

/** Sales transitions offered for the current state (mirrors PRD §11.1). */
function salesActions(status: EventStatus): ActionDef[] {
  switch (status) {
    case "PUBLISHED":
      return [PAUSE, CLOSE];
    case "SALES_PAUSED":
      return [RESUME, CLOSE];
    case "SALES_CLOSED":
      return [COMPLETE];
    case "POSTPONED":
      return [RESUME];
    default:
      return [];
  }
}

/** Lower-frequency lifecycle actions. */
function lifecycleActions(status: EventStatus): ActionDef[] {
  if (status === "CANCELLED" || status === "ARCHIVED") return [];
  if (status === "COMPLETED") return [ARCHIVE];
  const list: ActionDef[] = [];
  if (status === "PUBLISHED" || status === "SALES_PAUSED" || status === "SALES_CLOSED") {
    list.push(POSTPONE);
  }
  list.push(CANCEL);
  return list;
}

const PAUSE: ActionDef = {
  action: "pause",
  label: "Pausar vendas",
  title: "Pausar vendas?",
  description:
    "Os compradores continuam vendo a página, mas não conseguem finalizar compras até você retomar.",
  confirmLabel: "Pausar vendas",
  tone: "primary",
};
const RESUME: ActionDef = {
  action: "resume",
  label: "Retomar vendas",
  title: "Retomar vendas?",
  description: "As compras voltam a ser aceitas imediatamente.",
  confirmLabel: "Retomar vendas",
  tone: "primary",
};
const CLOSE: ActionDef = {
  action: "close_sales",
  label: "Encerrar vendas",
  title: "Encerrar vendas?",
  description:
    "As vendas serão encerradas e não poderão ser reabertas por aqui. Ingressos já vendidos continuam válidos.",
  confirmLabel: "Encerrar vendas",
  tone: "danger",
};
const COMPLETE: ActionDef = {
  action: "complete",
  label: "Concluir evento",
  title: "Concluir evento?",
  description: "Use após a realização do evento. Depois de concluído, você poderá arquivá-lo.",
  confirmLabel: "Concluir evento",
  tone: "primary",
};
const POSTPONE: ActionDef = {
  action: "postpone",
  label: "Adiar evento",
  title: "Adiar evento",
  description: "O evento fica marcado como adiado. Explique o motivo para o registro de auditoria.",
  confirmLabel: "Adiar evento",
  tone: "primary",
  justification: { label: "Motivo do adiamento", required: true, placeholder: "Ex.: nova data em negociação" },
};
const CANCEL: ActionDef = {
  action: "cancel",
  label: "Cancelar evento",
  title: "Cancelar evento",
  description:
    "Cancelar interrompe as vendas definitivamente. Ingressos já vendidos podem exigir reembolso. Esta ação não pode ser desfeita.",
  confirmLabel: "Cancelar evento",
  tone: "danger",
  justification: { label: "Motivo do cancelamento", required: true, placeholder: "Ex.: problema no local" },
};
const ARCHIVE: ActionDef = {
  action: "archive",
  label: "Arquivar evento",
  title: "Arquivar evento?",
  description: "O evento sai das listas ativas. Os dados históricos são preservados.",
  confirmLabel: "Arquivar",
  tone: "primary",
};

export function EventStatusControl({
  orgId,
  eventId,
  status,
  pageHref,
}: {
  orgId: string;
  eventId: string;
  status: EventStatus;
  pageHref: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<ActionDef | null>(null);
  const statusUrl = `/api/orgs/${orgId}/events/${eventId}/status`;

  const sales = salesActions(status);
  const lifecycle = lifecycleActions(status);
  const isDraft = status === "DRAFT";

  async function runConfirmed(justification?: string) {
    if (!pending) return { ok: false };
    const body: Record<string, unknown> = { action: pending.action };
    if (justification) body.justification = justification;
    const { ok, data } = await apiSend(statusUrl, "POST", body);
    if (ok) router.refresh();
    const error = typeof data.error === "string" ? data.error : undefined;
    return error ? { ok, error } : { ok };
  }

  return (
    <>
      {isDraft && (
        <Button
          leftIcon={<Rocket className="size-4" />}
          onClick={() => setPending(PUBLISH)}
        >
          Publicar evento
        </Button>
      )}

      {(sales.length > 0 || lifecycle.length > 0) && (
        <Menu
          triggerContent={
            <>
              <Settings2 className="size-4" />
              Gerenciar
              <ChevronDown className="size-4" />
            </>
          }
          triggerAriaLabel="Gerenciar evento"
          triggerVariant={isDraft ? "outline" : "secondary"}
        >
          {sales.length > 0 && <MenuLabel>Vendas</MenuLabel>}
          {sales.map((a) => (
            <MenuItem
              key={a.action}
              destructive={a.tone === "danger"}
              onSelect={() => setPending(a)}
            >
              {a.label}
            </MenuItem>
          ))}
          <MenuLabel>Evento</MenuLabel>
          <MenuItem icon={<Settings2 className="size-4" />} href={pageHref}>
            Personalizar página
          </MenuItem>
          {lifecycle.map((a) => (
            <MenuItem
              key={a.action}
              icon={a.action === "postpone" ? <CalendarClock className="size-4" /> : <XCircle className="size-4" />}
              destructive={a.tone === "danger"}
              onSelect={() => setPending(a)}
            >
              {a.label}
            </MenuItem>
          ))}
        </Menu>
      )}

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.title ?? ""}
        description={pending?.description}
        confirmLabel={pending?.confirmLabel ?? "Confirmar"}
        tone={pending?.tone ?? "primary"}
        justification={pending?.justification}
        onConfirm={runConfirmed}
      />
    </>
  );
}

const PUBLISH: ActionDef = {
  action: "publish",
  label: "Publicar evento",
  title: "Publicar evento?",
  description:
    "A página do evento ficará visível publicamente e as vendas poderão começar. Confira ingressos, lotes e a página antes de publicar.",
  confirmLabel: "Publicar",
  tone: "primary",
};

/** Small status pill with a leading dot — status is conveyed by text, not color alone. */
export function EventStatusBadge({ status }: { status: EventStatus }) {
  const meta = statusMeta(EVENT_STATUS, status);
  const dot: Record<string, string> = {
    neutral: "bg-ink-faint",
    brand: "bg-brand",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
  };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-hover px-2.5 py-0.5 text-small font-medium text-ink-soft">
      <span className={`size-1.5 rounded-full ${dot[meta.tone] ?? "bg-ink-faint"}`} aria-hidden />
      {meta.label}
    </span>
  );
}
