import type {
  CommissionRuleRecord,
  CouponRecord,
  EventRecord,
  PromoterAssignmentRecord,
  PromoterLinkRecord,
  PromoterSummaryRow,
  SalesBatchRecord,
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
