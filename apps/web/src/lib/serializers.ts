import type {
  AuditReadRecord,
  CheckinAssignmentRecord,
  CommissionRuleRecord,
  CouponRecord,
  CustomerRecord,
  SegmentResult,
  EventFinancialSummary,
  EventRecord,
  LedgerEntryRecord,
  OrderNoteRecord,
  OrderTimeline,
  PaymentRecord,
  PromoterAssignmentRecord,
  PromoterLinkRecord,
  PromoterSummaryRow,
  SalesBatchRecord,
  TicketRecord,
  TicketTypeRecord,
} from "@ingressos/core";

// Explicit output shaping: API responses expose ONLY these fields
// (CLAUDE_SECURITY_RULES §13 — never return full rows).

export function toEventResponse(event: EventRecord) {
  return {
    id: event.id,
    status: event.status,
    title: event.title,
    slug: event.slug,
    description: event.description,
    venueName: event.venueName,
    addressLine: event.addressLine,
    city: event.city,
    state: event.state,
    timezone: event.timezone,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    capacityTotal: event.capacityTotal,
    salesStartAt: event.salesStartAt,
    salesEndAt: event.salesEndAt,
    ageRating: event.ageRating,
    maxTicketsPerOrder: event.maxTicketsPerOrder,
    platformFeeBps: event.platformFeeBps,
    feeMode: event.feeMode,
    publishedAt: event.publishedAt,
  };
}

export function toTicketTypeResponse(ticketType: TicketTypeRecord) {
  return {
    id: ticketType.id,
    name: ticketType.name,
    kind: ticketType.kind,
    sectorId: ticketType.sectorId,
    active: ticketType.active,
  };
}

export function toBatchResponse(batch: SalesBatchRecord) {
  return {
    id: batch.id,
    ticketTypeId: batch.ticketTypeId,
    status: batch.status,
    name: batch.name,
    priceCents: batch.priceCents,
    quantityTotal: batch.quantityTotal,
    quantitySold: batch.quantitySold,
    quantityReserved: batch.quantityReserved,
    salesStartAt: batch.salesStartAt,
    salesEndAt: batch.salesEndAt,
    maxPerOrder: batch.maxPerOrder,
  };
}

export function toPromoterAssignmentResponse(a: PromoterAssignmentRecord) {
  return { id: a.id, eventId: a.eventId, membershipId: a.membershipId, active: a.active };
}

export function toPromoterLinkResponse(link: PromoterLinkRecord) {
  return {
    id: link.id,
    membershipId: link.membershipId,
    code: link.code,
    active: link.active,
    clickCount: link.clickCount,
  };
}

export function toCouponResponse(coupon: CouponRecord) {
  return {
    id: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    active: coupon.active,
    membershipId: coupon.membershipId,
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    maxRedemptions: coupon.maxRedemptions,
    redemptions: coupon.redemptions,
  };
}

export function toCommissionRuleResponse(rule: CommissionRuleRecord) {
  return {
    id: rule.id,
    membershipId: rule.membershipId,
    ticketTypeId: rule.ticketTypeId,
    type: rule.type,
    value: rule.value,
    base: rule.base,
    active: rule.active,
  };
}

export function toPromoterSummaryResponse(row: PromoterSummaryRow) {
  return {
    membershipId: row.membershipId,
    quantity: row.quantity,
    baseCents: row.baseCents,
    amountCents: row.amountCents,
  };
}

// The token hash NEVER leaves the server — only status/participant data.
export function toTicketResponse(ticket: TicketRecord) {
  return {
    id: ticket.id,
    status: ticket.status,
    ticketTypeId: ticket.ticketTypeId,
    orderId: ticket.orderId,
    participantName: ticket.participantName,
    participantEmail: ticket.participantEmail,
    issuedAt: ticket.issuedAt,
  };
}

function toOrderResponse(order: OrderTimeline["order"]) {
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    buyerDocument: order.buyerDocument,
    buyerPhone: order.buyerPhone,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    totalCents: order.totalCents,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
  };
}

// No QR/copia-e-cola, idempotency key or correlation id in support views.
function toPaymentResponse(payment: PaymentRecord) {
  return {
    id: payment.id,
    method: payment.method,
    status: payment.status,
    amountCents: payment.amountCents,
    providerTransactionId: payment.providerTransactionId,
    expiresAt: payment.expiresAt,
  };
}

export function toAuditEventResponse(event: AuditReadRecord) {
  return {
    id: event.id,
    action: event.action,
    actorType: event.actorType,
    actorUserId: event.actorUserId,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    justification: event.justification,
    before: event.before,
    after: event.after,
    createdAt: event.createdAt,
  };
}

export function toOrderNoteResponse(note: OrderNoteRecord) {
  return {
    id: note.id,
    authorUserId: note.authorUserId,
    body: note.body,
    createdAt: note.createdAt,
  };
}

export function toCheckinAssignmentResponse(a: CheckinAssignmentRecord) {
  return {
    id: a.id,
    membershipId: a.membershipId,
    sectorId: a.sectorId,
    active: a.active,
  };
}

export function toCustomerResponse(customer: CustomerRecord) {
  return {
    id: customer.id,
    email: customer.email,
    name: customer.name,
    phone: customer.phone,
    optedOut: customer.optedOut,
    consentAt: customer.consentAt,
  };
}

export function toSegmentResponse(segment: SegmentResult) {
  return {
    count: segment.count,
    totalSpentCents: segment.totalSpentCents,
    customers: segment.customers,
  };
}

export function toLedgerEntryResponse(entry: LedgerEntryRecord) {
  return {
    id: entry.id,
    orderId: entry.orderId,
    account: entry.account,
    type: entry.type,
    amountCents: entry.amountCents,
    membershipId: entry.membershipId,
    memo: entry.memo,
    createdAt: entry.createdAt,
  };
}

export function toFinancialSummaryResponse(summary: EventFinancialSummary) {
  return { ...summary };
}

export function toOrderTimelineResponse(timeline: OrderTimeline) {
  return {
    order: toOrderResponse(timeline.order),
    payments: timeline.payments.map(toPaymentResponse),
    tickets: timeline.tickets.map(toTicketResponse),
    events: timeline.events.map(toAuditEventResponse),
    notes: timeline.notes.map(toOrderNoteResponse),
  };
}
