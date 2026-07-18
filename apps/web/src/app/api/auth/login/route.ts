import { NextResponse } from "next/server";
import { loginSchema } from "@ingressos/core";
import { readJsonBody, requestMetaFrom, route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { setSessionCookie } from "@/lib/session";

export const POST = route(async (request, { correlationId }) => {
  const input = loginSchema.parse(await readJsonBody(request));
  const meta = requestMetaFrom(request, correlationId);

  const { rawToken, expiresAt, userId } = await getServices().auth.login(input, meta);

  // The token travels ONLY in the httpOnly cookie — never in the JSON body.
  const response = NextResponse.json({ userId, expiresAt }, { status: 200 });
  setSessionCookie(response, rawToken);
  return response;
});
