import { NextResponse } from "next/server";
import { z } from "zod";
import { customerLookupSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";
import { getServices } from "@/lib/services";

const paramsSchema = z.string().uuid();

/**
 * Public checkout convenience: given a phone, tell the buyer whether they
 * already have a cadastro — returning ONLY a masked preview. The real name/
 * e-mail never leave the server (reuse is resolved server-side at order
 * creation). Rate-limited hard to prevent PII enumeration.
 */
export const POST = route<{ eventId: string }>(async (request, { params, correlationId }) => {
  await enforceRateLimit("customer-lookup", clientIpFrom(request), 30, 5 * 60);

  const eventId = paramsSchema.parse(params.eventId);
  const input = customerLookupSchema.parse(await readJsonBody(request));

  const services = getServices();
  const event = await services.publicEvents.findPublishedById(eventId);
  if (!event) {
    return NextResponse.json({ error: "Evento não encontrado.", correlationId }, { status: 404 });
  }

  const result = await services.customers.lookupByPhone(event.organizationId, input.phone);
  return NextResponse.json(result);
});
