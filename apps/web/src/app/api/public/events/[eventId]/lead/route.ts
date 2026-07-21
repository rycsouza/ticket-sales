import { NextResponse } from "next/server";
import { z } from "zod";
import { checkoutLeadSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";
import { getServices } from "@/lib/services";

const paramsSchema = z.string().uuid();

/**
 * Public checkout lead capture (mid/bottom funnel): persists the contact that
 * advanced past "Seus dados" even if they never pay. Best-effort — the org is
 * resolved from the published event; only brand-new contacts are added (never
 * overwrites existing customers). Rate-limited to prevent CRM spam.
 */
export const POST = route<{ eventId: string }>(async (request, { params, correlationId }) => {
  const ip = clientIpFrom(request);
  await enforceRateLimit("checkout-lead-ip", ip, 20, 5 * 60);

  const eventId = paramsSchema.parse(params.eventId);
  const input = checkoutLeadSchema.parse(await readJsonBody(request));
  await enforceRateLimit("checkout-lead-contact", input.email, 5, 5 * 60);

  const services = getServices();
  const event = await services.publicEvents.findPublishedById(eventId);
  if (!event) {
    return NextResponse.json({ error: "Evento não encontrado.", correlationId }, { status: 404 });
  }

  await services.customers.captureLead({
    organizationId: event.organizationId,
    email: input.email,
    name: input.name,
    phone: input.phone,
  });

  return NextResponse.json({ ok: true });
});
