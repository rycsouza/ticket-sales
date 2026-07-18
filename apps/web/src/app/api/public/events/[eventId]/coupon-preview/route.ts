import { NextResponse } from "next/server";
import { z } from "zod";
import { couponPreviewSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";
import { getServices } from "@/lib/services";

const REASON_MESSAGE: Record<string, string> = {
  not_found: "Cupom inválido.",
  inactive: "Cupom inativo.",
  not_started: "Cupom ainda não está válido.",
  expired: "Cupom expirado.",
  exhausted: "Cupom esgotado.",
};

const paramsSchema = z.string().uuid();

/**
 * Public coupon check for the checkout UI (FR-CHK-008). Returns validity and,
 * when valid, the type/value for display only — the binding discount is always
 * recomputed server-side at order creation.
 */
export const POST = route<{ eventId: string }>(async (request, { params, correlationId }) => {
  await enforceRateLimit("coupon-preview", clientIpFrom(request), 60, 5 * 60);

  const eventId = paramsSchema.parse(params.eventId);
  const input = couponPreviewSchema.parse(await readJsonBody(request));

  const services = getServices();
  const event = await services.publicEvents.findPublishedById(eventId);
  if (!event) {
    return NextResponse.json({ error: "Evento não encontrado.", correlationId }, { status: 404 });
  }

  const result = await services.promoters.previewCoupon({
    organizationId: event.organizationId,
    eventId: event.id,
    code: input.code,
    now: new Date(),
  });

  if (!result.valid) {
    return NextResponse.json({
      valid: false,
      message: REASON_MESSAGE[result.reason] ?? "Cupom inválido.",
    });
  }
  return NextResponse.json({ valid: true, type: result.type, value: result.value });
});
