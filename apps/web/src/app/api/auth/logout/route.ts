import { NextResponse } from "next/server";
import { requestMetaFrom, route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { clearSessionCookie, requireAuth } from "@/lib/session";

export const POST = route(async (request, { correlationId }) => {
  const meta = requestMetaFrom(request, correlationId);
  const user = await requireAuth(request);

  await getServices().auth.logout(user.rawToken, meta);

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
});
