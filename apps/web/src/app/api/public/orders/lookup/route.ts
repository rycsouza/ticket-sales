import { NextResponse } from "next/server";
import { NotFoundOrForbiddenError, orderAccessSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";
import { getServices } from "@/lib/services";

/**
 * Buyer order status (FR-CHK-017/018). POST on purpose: code+email are
 * credentials and must never live in a URL (CLAUDE_SECURITY_RULES §Privacy).
 * Accepts the strong access token (Print 4) or the code+e-mail pair.
 */
export const POST = route(async (request, { correlationId }) => {
  // Generous: the order page polls every 10s while awaiting payment
  await enforceRateLimit("order-lookup", clientIpFrom(request), 120, 5 * 60);

  const input = orderAccessSchema.parse(await readJsonBody(request));
  const services = getServices();

  let order;
  if (input.token) {
    order = await services.orders.getOrderByAccessToken(input.token);
  } else if (input.code && input.email) {
    order = await services.orders.getOrderForBuyer(input.code, input.email);
  } else {
    throw new NotFoundOrForbiddenError();
  }

  if (order.status === "AWAITING_PAYMENT") {
    if (order.expiresAt && order.expiresAt.getTime() <= Date.now()) {
      // Lazy expiration: an overdue order resolves correctly even between sweeps
      await services.orders.expireDueOrders();
      order.status = "EXPIRED";
    } else {
      // Print 5: consult the gateway (throttled) and heal any divergence, so
      // confirmation never depends solely on the webhook. Re-read to reflect it.
      await services.payments.reconcileOrder(order.organizationId, order.id, { correlationId });
      const fresh = await services.orders.getOrderById(order.organizationId, order.id);
      if (fresh) order.status = fresh.status;
    }
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
