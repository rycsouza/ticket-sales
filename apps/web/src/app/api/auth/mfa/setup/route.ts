import { NextResponse } from "next/server";
import { mfaSetupSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getServices } from "@/lib/services";

/** DEC-012 — begin TOTP enrollment; returns secret + otpauth URI for the QR. */
export const POST = route(async (request) => {
  const input = mfaSetupSchema.parse(await readJsonBody(request));
  const result = await getServices().auth.setupMfa(input.challengeToken);
  return NextResponse.json(result);
});
