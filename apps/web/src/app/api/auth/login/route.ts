import { NextResponse } from "next/server";
import { loginSchema } from "@ingressos/core";
import { readJsonBody, requestMetaFrom, route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { readTrustedDeviceToken, setSessionCookie } from "@/lib/session";

export const POST = route(async (request, { correlationId }) => {
  const input = loginSchema.parse(await readJsonBody(request));
  const meta = requestMetaFrom(request, correlationId);

  const result = await getServices().auth.login(input, meta, {
    trustedDeviceToken: readTrustedDeviceToken(request),
  });

  // MFA gates (DEC-012): no session yet — return the challenge for the next step.
  if (result.status !== "authenticated") {
    return NextResponse.json({ status: result.status, challengeToken: result.challengeToken });
  }

  // The token travels ONLY in the httpOnly cookie — never in the JSON body.
  const response = NextResponse.json({ status: "authenticated", userId: result.userId });
  setSessionCookie(response, result.rawToken);
  return response;
});
