import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/http";
import { getPublicEventView } from "@/lib/public-views";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";

const paramsSchema = z.string().uuid();

/**
 * Public event page data (FR-CHK-001..003). No auth: only PUBLISHED events
 * resolve, and the response is a curated allowlist (see getPublicEventView).
 */
export const GET = route<{ eventId: string }>(async (request, { params }) => {
  await enforceRateLimit("public-event", clientIpFrom(request), 120, 60);

  const eventId = paramsSchema.parse(params.eventId);
  const view = await getPublicEventView(eventId);
  if (!view) {
    return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  }
  return NextResponse.json(view);
});
