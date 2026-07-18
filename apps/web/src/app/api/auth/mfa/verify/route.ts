import { NextResponse } from "next/server";
import { mfaVerifySchema } from "@ingressos/core";
import { readJsonBody, requestMetaFrom, route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { setSessionCookie, setTrustedDeviceCookie } from "@/lib/session";

/** DEC-012 — second factor at login (TOTP or backup code). */
export const POST = route(async (request, { correlationId }) => {
  const input = mfaVerifySchema.parse(await readJsonBody(request));
  const meta = requestMetaFrom(request, correlationId);

  const result = await getServices().auth.verifyMfa(input.challengeToken, input.code, meta, {
    trustDevice: input.trustDevice,
  });

  const response = NextResponse.json({ status: "authenticated", userId: result.userId });
  setSessionCookie(response, result.rawToken);
  if (result.trustedDeviceToken) setTrustedDeviceCookie(response, result.trustedDeviceToken);
  return response;
});
