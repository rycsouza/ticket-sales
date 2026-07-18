// pt-BR labels for the support console (order + ticket state machines, PRD §11).

export const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: "Criado",
  AWAITING_PAYMENT: "Aguardando pagamento",
  PAID: "Pago",
  PARTIALLY_REFUNDED: "Reembolso parcial",
  REFUNDED: "Reembolsado",
  EXPIRED: "Expirado",
  CANCELLED: "Cancelado",
  CHARGEBACK: "Chargeback",
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  ISSUED: "Emitido",
  VALID: "Válido",
  BLOCKED: "Bloqueado",
  CHECKED_IN: "Check-in feito",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
  TRANSFERRED: "Transferido",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function ticketStatusLabel(status: string): string {
  return TICKET_STATUS_LABELS[status] ?? status;
}

export function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
