import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { loadServerEnv } from "@ingressos/config";
import { UnauthenticatedError } from "@ingressos/core";
import { route } from "@/lib/http";
import { getServices } from "@/lib/services";

/**
 * Reservation/order expiry sweep (FR-INV-007, BR-INV-003), invoked by a
 * QStash Schedule (ARQUITETURA §9 — Vercel hobby cron is daily-only, QStash
 * runs per-minute). Signature-verified; idempotent by design, so overlapping
 * runs are harmless. Lazy expiration on buyer endpoints covers the gap
 * between runs.
 *
 * Setup (one-time): create the schedule in the Upstash console pointing to
 * POST {APP_BASE_URL}/api/jobs/sweep, e.g. cron "* * * * *".
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
          .verify({ signature, body, url: `${env.APP_BASE_URL}/api/jobs/sweep` })
          .catch(() => false)
      : false;
    if (!valid) throw new UnauthenticatedError();
  } else if (env.NODE_ENV === "production") {
    // Never run an unauthenticated job endpoint in production
    throw new UnauthenticatedError();
  }

  const expired = await getServices().orders.expireDueOrders(200);

  if (expired > 0) {
    console.info(`[sweep] correlationId=${correlationId} expiredOrders=${expired}`);
  }
  return NextResponse.json({ expired });
});
