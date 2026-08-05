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
import { flex, type OrgVocab } from "@/lib/org-vocab";
import { apiSend, ConfirmDialog } from "../../../ui";

type EventStatus = string;

/** Friendly pt-BR for the (English) publish-readiness domain error. */
function publishFieldLabels(vocab: OrgVocab): Record<string, string> {
  return {
    startsAt: "data de início",
    venueName: vocab.venue.toLowerCase(),
    city: "cidade",
    "at least one sales batch": `ao menos um lote de ${vocab.ticket}`,
  };
}
function translatePublishError(message: string, vocab: OrgVocab): string {
  const match = /not ready to publish: missing (.+)$/i.exec(message);
  if (!match) return message;
  const labels = publishFieldLabels(vocab);
  const fields = match[1]!
    .split(",")
    .map((f) => labels[f.trim()] ?? f.trim());
  return `Ainda falta preencher para publicar: ${fields.join(", ")}.`;
}

/** "a viagem" → "A viagem" (início de frase). */
const cap = (phrase: string) => phrase.charAt(0).toUpperCase() + phrase.slice(1);

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
function salesActions(status: EventStatus, v: OrgVocab): ActionDef[] {
  switch (status) {
    case "PUBLISHED":
      return [PAUSE, close(v)];
    case "SALES_PAUSED":
      return [RESUME, close(v)];
    case "SALES_CLOSED":
      return [complete(v)];
    case "POSTPONED":
      return [RESUME];
    default:
      return [];
  }
}

/** Lower-frequency lifecycle actions. */
function lifecycleActions(status: EventStatus, v: OrgVocab): ActionDef[] {
  if (status === "CANCELLED" || status === "ARCHIVED") return [];
  if (status === "COMPLETED") return [archive(v)];
  const list: ActionDef[] = [];
  if (status === "PUBLISHED" || status === "SALES_PAUSED" || status === "SALES_CLOSED") {
    list.push(postpone(v));
  }
  list.push(cancel(v));
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
const close = (v: OrgVocab): ActionDef => ({
  action: "close_sales",
  label: "Encerrar vendas",
  title: "Encerrar vendas?",
  description: `As vendas serão encerradas e não poderão ser reabertas por aqui. ${v.Tickets} já ${flex("vendidos", v.ticketGender)} continuam ${flex("válidos", v.ticketGender)}.`,
  confirmLabel: "Encerrar vendas",
  tone: "danger",
});
const complete = (v: OrgVocab): ActionDef => ({
  action: "complete",
  label: `Concluir ${v.event}`,
  title: `Concluir ${v.event}?`,
  description: `Use após a realização ${v.ofEvent}. Depois de ${flex("concluído", v.gender)}, você poderá arquivá-l${v.gender === "f" ? "a" : "o"}.`,
  confirmLabel: `Concluir ${v.event}`,
  tone: "primary",
});
const postpone = (v: OrgVocab): ActionDef => ({
  action: "postpone",
  label: `Adiar ${v.event}`,
  title: `Adiar ${v.event}`,
  description: `${cap(v.theEvent)} fica ${flex("marcado", v.gender)} como ${flex("adiado", v.gender)}. Explique o motivo para o registro de auditoria.`,
  confirmLabel: `Adiar ${v.event}`,
  tone: "primary",
  justification: { label: "Motivo do adiamento", required: true, placeholder: "Ex.: nova data em negociação" },
});
const cancel = (v: OrgVocab): ActionDef => ({
  action: "cancel",
  label: `Cancelar ${v.event}`,
  title: `Cancelar ${v.event}`,
  description: `Cancelar interrompe as vendas definitivamente. ${v.Tickets} já ${flex("vendidos", v.ticketGender)} podem exigir reembolso. Esta ação não pode ser desfeita.`,
  confirmLabel: `Cancelar ${v.event}`,
  tone: "danger",
  justification: { label: "Motivo do cancelamento", required: true, placeholder: "Ex.: problema no local" },
});
const archive = (v: OrgVocab): ActionDef => ({
  action: "archive",
  label: `Arquivar ${v.event}`,
  title: `Arquivar ${v.event}?`,
  description: `${cap(v.theEvent)} sai das listas ativas. Os dados históricos são preservados.`,
  confirmLabel: "Arquivar",
  tone: "primary",
});

export function EventStatusControl({
  orgId,
  eventId,
  status,
  pageHref,
  vocab,
}: {
  orgId: string;
  eventId: string;
  status: EventStatus;
  pageHref: string;
  vocab: OrgVocab;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<ActionDef | null>(null);
  const statusUrl = `/api/orgs/${orgId}/events/${eventId}/status`;

  const sales = salesActions(status, vocab);
  const lifecycle = lifecycleActions(status, vocab);
  const isDraft = status === "DRAFT";

  async function runConfirmed(justification?: string) {
    if (!pending) return { ok: false };
    const body: Record<string, unknown> = { action: pending.action };
    if (justification) body.justification = justification;
    const { ok, data } = await apiSend(statusUrl, "POST", body);
    if (ok) router.refresh();
    const error = typeof data.error === "string" ? translatePublishError(data.error, vocab) : undefined;
    return error ? { ok, error } : { ok };
  }

  return (
    <>
      {isDraft && (
        <Button
          leftIcon={<Rocket className="size-4" />}
          onClick={() => setPending(publish(vocab))}
        >
          Publicar {vocab.event}
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
          triggerAriaLabel={`Gerenciar ${vocab.event}`}
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
          <MenuLabel>{vocab.Event}</MenuLabel>
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

const publish = (v: OrgVocab): ActionDef => ({
  action: "publish",
  label: `Publicar ${v.event}`,
  title: `Publicar ${v.event}?`,
  description: `A página ${v.ofEvent} ficará visível publicamente e as vendas poderão começar. Confira ${v.tickets}, lotes e a página antes de publicar.`,
  confirmLabel: "Publicar",
  tone: "primary",
});

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
