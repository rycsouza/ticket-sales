import { NextResponse } from "next/server";
import { createOrderSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";
import { getServices } from "@/lib/services";

/** Public checkout (FR-CHK-005..017): guest purchase, no account needed. */
export const POST = route(async (request, { correlationId }) => {
  const ip = clientIpFrom(request);
  await enforceRateLimit("public-order-ip", ip, 10, 5 * 60);

  const input = createOrderSchema.parse(await readJsonBody(request));
  await enforceRateLimit("public-order-email", input.buyer.email, 10, 5 * 60);

  const { order, expiresAt } = await getServices().orders.createOrder(input, {
    correlationId,
  });

  return NextResponse.json(
    {
      code: order.code,
      status: order.status,
      totalCents: order.totalCents,
      // FR-CHK-011: countdown target for the reservation
      expiresAt,
    },
    { status: 201 },
  );
});
