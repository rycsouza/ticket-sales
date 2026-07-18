import type { BadgeTone } from "@/components/ui/badge";

type StatusMeta = { label: string; tone: BadgeTone };

/** Order state machine (PRD §11.2) → pt-BR label + badge tone. */
export const ORDER_STATUS: Record<string, StatusMeta> = {
  CREATED: { label: "Criado", tone: "neutral" },
  AWAITING_PAYMENT: { label: "Aguardando pagamento", tone: "warning" },
  PAID: { label: "Pago", tone: "success" },
  PARTIALLY_REFUNDED: { label: "Reembolso parcial", tone: "info" },
  REFUNDED: { label: "Reembolsado", tone: "neutral" },
  EXPIRED: { label: "Expirado", tone: "neutral" },
  CANCELLED: { label: "Cancelado", tone: "danger" },
  CHARGEBACK: { label: "Chargeback", tone: "danger" },
};

/** Ticket state machine (schema TicketStatus). */
export const TICKET_STATUS: Record<string, StatusMeta> = {
  PENDING_ISSUE: { label: "Emissão pendente", tone: "warning" },
  VALID: { label: "Válido", tone: "success" },
  CHECKED_IN: { label: "Check-in feito", tone: "brand" },
  BLOCKED: { label: "Bloqueado", tone: "danger" },
  CANCELLED: { label: "Cancelado", tone: "neutral" },
  REFUNDED: { label: "Reembolsado", tone: "neutral" },
};

/** Payment state machine (schema PaymentStatus). */
export const PAYMENT_STATUS: Record<string, StatusMeta> = {
  CREATED: { label: "Criado", tone: "neutral" },
  PROCESSING: { label: "Processando", tone: "info" },
  APPROVED: { label: "Aprovado", tone: "success" },
  REJECTED: { label: "Recusado", tone: "danger" },
  EXPIRED: { label: "Expirado", tone: "neutral" },
  CANCELLED: { label: "Cancelado", tone: "neutral" },
  PARTIALLY_REFUNDED: { label: "Reembolso parcial", tone: "info" },
  REFUNDED: { label: "Reembolsado", tone: "neutral" },
  DISPUTED: { label: "Em disputa", tone: "warning" },
  CHARGED_BACK: { label: "Chargeback", tone: "danger" },
};

/** Event lifecycle (schema EventStatus). */
export const EVENT_STATUS: Record<string, StatusMeta> = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  PUBLISHED: { label: "Publicado", tone: "success" },
  SALES_PAUSED: { label: "Vendas pausadas", tone: "warning" },
  SALES_CLOSED: { label: "Vendas encerradas", tone: "neutral" },
  POSTPONED: { label: "Adiado", tone: "warning" },
  CANCELLED: { label: "Cancelado", tone: "danger" },
  COMPLETED: { label: "Concluído", tone: "neutral" },
  ARCHIVED: { label: "Arquivado", tone: "neutral" },
};

/** Sales batch status (schema SalesBatchStatus). */
export const BATCH_STATUS: Record<string, StatusMeta> = {
  SCHEDULED: { label: "Agendado", tone: "info" },
  OPEN: { label: "Aberto", tone: "success" },
  CLOSED: { label: "Fechado", tone: "neutral" },
  SOLD_OUT: { label: "Esgotado", tone: "warning" },
};

export function statusMeta(map: Record<string, StatusMeta>, key: string): StatusMeta {
  return map[key] ?? { label: key, tone: "neutral" };
}

/** Money in cents → pt-BR BRL. */
export function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { dateStyle: "medium" });
}
