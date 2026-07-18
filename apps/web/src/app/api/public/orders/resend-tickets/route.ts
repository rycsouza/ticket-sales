import { NextResponse } from "next/server";
import { ConflictError, orderLookupSchema } from "@ingressos/core";
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

  const input = orderLookupSchema.parse(await readJsonBody(request));
  await enforceRateLimit("resend-tickets-order", input.code, 3, 10 * 60);

  const services = getServices();
  const order = await services.orders.getOrderForBuyer(input.code, input.email);
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
