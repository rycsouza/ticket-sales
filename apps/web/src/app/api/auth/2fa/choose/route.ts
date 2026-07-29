import { NextResponse } from "next/server";
import { secondFactorChoiceSchema } from "@ingressos/core";
import { readJsonBody, requestMetaFrom, route } from "@/lib/http";
import { getPlatformServices } from "@/lib/services";

/**
 * Choose-at-login (DEC-012): the user picked a second factor. Returns the
 * concrete next challenge — for "email" the code was just sent; for the TOTP
 * steps the client continues with the existing /mfa/setup|verify routes.
 */
export const POST = route(async (request, { correlationId }) => {
  const input = secondFactorChoiceSchema.parse(await readJsonBody(request));
  const meta = requestMetaFrom(request, correlationId);

  const result = await getPlatformServices().auth.chooseSecondFactor(
    input.challengeToken,
    input.method,
    meta,
  );

  return NextResponse.json(result);
});
