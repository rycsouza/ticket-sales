import { NextResponse } from "next/server";
import { registerSchema } from "@ingressos/core";
import { readJsonBody, requestMetaFrom, route } from "@/lib/http";
import { getPlatformServices } from "@/lib/services";

export const POST = route(async (request, { correlationId }) => {
  const input = registerSchema.parse(await readJsonBody(request));
  const meta = requestMetaFrom(request, correlationId);

  const { userId } = await getPlatformServices().auth.register(input, meta);

  return NextResponse.json({ userId }, { status: 201 });
});
