import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/http";
import { clientIpFrom, enforceRateLimit } from "@/lib/rate-limit";
import { getServices } from "@/lib/services";

const tokenSchema = z.string().min(20).max(200);

/**
 * Ticket page data (FR-TKT-004): the token in the URL is the credential.
 * The QR is rendered client-side from the token the buyer already has —
 * the response never echoes it (it never re-enters a response body).
 */
export const GET = route<{ token: string }>(async (request, { params }) => {
  await enforceRateLimit("public-ticket", clientIpFrom(request), 60, 5 * 60);

  const rawToken = tokenSchema.parse(params.token);
  const services = getServices();

  const ticket = await services.ticketsService.getPublicTicket(rawToken);
  const event = await services.publicEvents.findPublishedById(ticket.eventId);

  return NextResponse.json({
    status: ticket.status,
    participantName: ticket.participantName,
    event: event
      ? {
          title: event.title,
          venueName: event.venueName,
          city: event.city,
          startsAt: event.startsAt,
          timezone: event.timezone,
        }
      : null,
  });
});
