import "server-only";

import { RateLimitExceededError } from "@ingressos/core";
import { getServices } from "./services";

/**
 * Public-endpoint abuse protection (CLAUDE_SECURITY_RULES §20). Counters live
 * in Upstash — shared across serverless instances.
 */
export async function enforceRateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const attempts = await getServices().cache.increment(
    `rl:${bucket}:${identifier}`,
    windowSeconds,
  );
  if (attempts > limit) throw new RateLimitExceededError();
}

export function clientIpFrom(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
