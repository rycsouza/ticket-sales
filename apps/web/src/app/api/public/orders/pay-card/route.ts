import { NextResponse } from "next/server";
import { NotFoundOrForbiddenError, orderCardPaymentSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";
import { getServices } from "@/lib/services";

/**
 * Card charge for the buyer's order (FR-CHK-014, NFR-SEC-008). The card is
 * tokenized in the browser — only an opaque token reaches us. Access is proven
 * by the order access token (Print 4) or the code+e-mail pair; the amount and
 * payer e-mail are resolved SERVER-SIDE from the order, never from the client.
 */
export const POST = route(async (request, { correlationId }) => {
  await enforceRateLimit("order-pay-card", clientIpFrom(request), 15, 5 * 60);

  const input = orderCardPaymentSchema.parse(await readJsonBody(request));
  const services = getServices();

  let target: { organizationId: string; orderId: string };
  if (input.token) {
    target = await services.orders.resolveAccessToken(input.token);
  } else if (input.code && input.email) {
    const order = await services.orders.getOrderForBuyer(input.code, input.email);
    target = { organizationId: order.organizationId, orderId: order.id };
  } else {
    throw new NotFoundOrForbiddenError();
  }

  const result = await services.payments.createCardChargeForOrder(
    target.organizationId,
    target.orderId,
    {
      cardToken: input.card.cardToken,
      installments: input.card.installments,
      paymentMethodId: input.card.paymentMethodId,
      issuerId: input.card.issuerId,
      payerIdentification: input.card.payerIdentification,
    },
    { correlationId },
  );

  return NextResponse.json({ status: result.status });
});
