import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { loadServerEnv } from "@ingressos/config";
import { UnauthenticatedError } from "@ingressos/core";
import { route } from "@/lib/http";
import { getServices } from "@/lib/services";

/**
 * DEC-010 (LGPD) retention job — anonymizes buyers inactive beyond the window.
 * QStash-signed; idempotent. Setup: schedule POST {APP_BASE_URL}/api/jobs/retention
 * (e.g. daily, "0 4 * * *").
 */
export const POST = route(async (request, { correlationId }) => {
  const env = loadServerEnv();

  if (env.QSTASH_CURRENT_SIGNING_KEY && env.QSTASH_NEXT_SIGNING_KEY) {
    const receiver = new Receiver({
      currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
    });
    const signature = request.headers.get("upstash-signature");
    const body = await request.text();
    const valid = signature
      ? await receiver
          .verify({ signature, body, url: `${env.APP_BASE_URL}/api/jobs/retention` })
          .catch(() => false)
      : false;
    if (!valid) throw new UnauthenticatedError();
  } else if (env.NODE_ENV === "production") {
    throw new UnauthenticatedError();
  }

  const anonymized = await getServices().customers.runRetention(new Date(), 200);
  if (anonymized > 0) {
    console.info(`[retention] correlationId=${correlationId} anonymized=${anonymized}`);
  }
  return NextResponse.json({ anonymized });
});
