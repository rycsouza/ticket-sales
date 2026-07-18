import { NextResponse } from "next/server";
import { orderLookupSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";
import { getServices } from "@/lib/services";

/**
 * Pix charge for the buyer's order (FR-CHK-013, FR-PAY-019). Idempotent:
 * refreshing returns the same pending charge (FR-CHK-016/018).
 */
export const POST = route(async (request, { correlationId }) => {
  await enforceRateLimit("order-pay", clientIpFrom(request), 20, 5 * 60);

  const input = orderLookupSchema.parse(await readJsonBody(request));

  const payment = await getServices().payments.createPixChargeForOrder(
    input.code,
    input.email,
    { correlationId },
  );

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
