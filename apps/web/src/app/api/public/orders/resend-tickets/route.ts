import { NextResponse } from "next/server";
import { ConflictError, NotFoundOrForbiddenError, orderAccessSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";
import { getServices } from "@/lib/services";

/**
 * Ticket recovery (FR-TKT-006, NFR-AVL-006): rotates every ticket token of
 * the order (invalidating old links/QRs — BR-TKT-002) and re-sends the
 * confirmation e-mail. Strictly rate limited: each call kills live QR codes,
 * so this must never be cheap to spam.
 */
export const POST = route(async (request, { correlationId }) => {
  await enforceRateLimit("resend-tickets", clientIpFrom(request), 3, 10 * 60);

  const input = orderAccessSchema.parse(await readJsonBody(request));
  // Per-order limit: token maps 1:1 to an order, so either credential is a
  // stable key. Each call kills live QR codes — it must never be cheap to spam.
  await enforceRateLimit("resend-tickets-order", input.token ?? input.code ?? "", 3, 10 * 60);

  const services = getServices();
  let order;
  if (input.token) {
    order = await services.orders.getOrderByAccessToken(input.token);
  } else if (input.code && input.email) {
    order = await services.orders.getOrderForBuyer(input.code, input.email);
  } else {
    throw new NotFoundOrForbiddenError();
  }
  if (order.status !== "PAID") {
    throw new ConflictError("Only paid orders have tickets to resend");
  }

  const rotated = await services.ticketsService.rotateTokensForOrder(
    order.organizationId,
    order.id,
    { correlationId },
  );
  await services.notifications.sendOrderConfirmation(order, rotated, { correlationId });

  return NextResponse.json({ ok: true, tickets: rotated.length });
});
