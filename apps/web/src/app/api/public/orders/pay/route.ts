import { NextResponse } from "next/server";
import { NotFoundOrForbiddenError, orderAccessSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";
import { getServices } from "@/lib/services";

/**
 * Pix charge for the buyer's order (FR-CHK-013, FR-PAY-019). Idempotent:
 * refreshing returns the same pending charge (FR-CHK-016/018). Accepts the
 * strong access token (Print 4) or the code+e-mail pair.
 */
export const POST = route(async (request, { correlationId }) => {
  await enforceRateLimit("order-pay", clientIpFrom(request), 20, 5 * 60);

  const input = orderAccessSchema.parse(await readJsonBody(request));
  const services = getServices();

  let payment;
  if (input.token) {
    const target = await services.orders.resolveAccessToken(input.token);
    payment = await services.payments.createPixChargeById(
      target.organizationId,
      target.orderId,
      { correlationId },
    );
  } else if (input.code && input.email) {
    payment = await services.payments.createPixChargeForOrder(input.code, input.email, {
      correlationId,
    });
  } else {
    throw new NotFoundOrForbiddenError();
  }

  return NextResponse.json({
    method: payment.method,
    status: payment.status,
    amountCents: payment.amountCents,
    // FR-PAY-019: QR image + copia-e-cola + expiration
    pixQrCode: payment.pixQrCode,
    pixQrCodeText: payment.pixQrCodeText,
    expiresAt: payment.expiresAt,
  });
});
