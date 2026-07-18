import { NextResponse } from "next/server";
import { registerSchema } from "@ingressos/core";
import { readJsonBody, requestMetaFrom, route } from "@/lib/http";
import { getServices } from "@/lib/services";

export const POST = route(async (request, { correlationId }) => {
  const input = registerSchema.parse(await readJsonBody(request));
  const meta = requestMetaFrom(request, correlationId);

  const { userId } = await getServices().auth.register(input, meta);

  return NextResponse.json({ userId }, { status: 201 });
});
