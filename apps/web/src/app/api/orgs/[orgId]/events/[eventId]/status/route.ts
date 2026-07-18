import { NextResponse } from "next/server";
import { z } from "zod";
import { ValidationFailedError, type EventRecord, type RequestContext } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { toEventResponse } from "@/lib/serializers";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

const statusActionSchema = z
  .object({
    action: z.enum([
      "publish",
      "pause",
      "resume",
      "close_sales",
      "postpone",
      "cancel",
      "complete",
      "archive",
    ]),
    justification: z.string().trim().min(5).max(500).optional(),
  })
  .strict();

/**
 * Single endpoint for lifecycle transitions (PRD §11.1). The service layer
 * validates the state machine; postpone/cancel demand a justification.
 */
export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = statusActionSchema.parse(await readJsonBody(request));
    const { events } = getServices();

    const event = await applyAction(events, ctx, params.eventId, input);

    return NextResponse.json(toEventResponse(event));
  },
);

async function applyAction(
  events: ReturnType<typeof getServices>["events"],
  ctx: RequestContext,
  eventId: string,
  input: z.infer<typeof statusActionSchema>,
): Promise<EventRecord> {
  switch (input.action) {
    case "publish":
      return events.publishEvent(ctx, eventId);
    case "pause":
      return events.pauseSales(ctx, eventId);
    case "resume":
      return events.resumeSales(ctx, eventId);
    case "close_sales":
      return events.closeSales(ctx, eventId);
    case "postpone":
      if (!input.justification) {
        throw new ValidationFailedError("A justification is required to postpone");
      }
      return events.postponeEvent(ctx, eventId, input.justification);
    case "cancel":
      if (!input.justification) {
        throw new ValidationFailedError("A justification is required to cancel");
      }
      return events.cancelEvent(ctx, eventId, input.justification);
    case "complete":
      return events.completeEvent(ctx, eventId);
    case "archive":
      return events.archiveEvent(ctx, eventId);
  }
}
