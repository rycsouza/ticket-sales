import { NextResponse } from "next/server";
import { orderLookupSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";
import { getServices } from "@/lib/services";

/**
 * Buyer order status (FR-CHK-017/018). POST on purpose: code+email are
 * credentials and must never live in a URL (CLAUDE_SECURITY_RULES §Privacy).
 */
export const POST = route(async (request, { correlationId }) => {
  // Generous: the order page polls every 10s while awaiting payment
  await enforceRateLimit("order-lookup", clientIpFrom(request), 120, 5 * 60);

  const input = orderLookupSchema.parse(await readJsonBody(request));
  const services = getServices();

  const order = await services.orders.getOrderForBuyer(input.code, input.email);

  // Lazy expiration: an overdue order resolves correctly even between sweeps
  if (
    order.status === "AWAITING_PAYMENT" &&
    order.expiresAt &&
    order.expiresAt.getTime() <= Date.now()
  ) {
    await services.orders.expireDueOrders();
    order.status = "EXPIRED";
  }

  return NextResponse.json({
    code: order.code,
    status: order.status,
    totalCents: order.totalCents,
    expiresAt: order.expiresAt,
    // Ticket links are delivered by e-mail or regenerated via resend —
    // never listed here (the lookup credential is weaker than the token).
  });
});
