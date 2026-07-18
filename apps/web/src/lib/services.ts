import "server-only";

import { loadServerEnv } from "@ingressos/config";
import {
  AuthService,
  EventsService,
  IdentityService,
  InventoryService,
  PrismaAuditRepository,
  PrismaEventRepository,
  PrismaInviteRepository,
  PrismaMembershipRepository,
  PrismaOrganizationRepository,
  PrismaSalesBatchRepository,
  PrismaSectorRepository,
  PrismaSessionRepository,
  PrismaTicketTypeRepository,
  PrismaUserRepository,
  systemClock,
  type CachePort,
} from "@ingressos/core";
import { Argon2PasswordHasher, MemoryCache, UpstashRedisCache } from "@ingressos/adapters";
import { getPrisma } from "@ingressos/db";

/**
 * Composition root — the ONLY place where concrete adapters meet the domain.
 * Module scope survives across warm serverless invocations, so services are
 * built once per instance.
 */
function buildCache(): CachePort {
  const env = loadServerEnv();
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashRedisCache(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  }
  if (env.NODE_ENV === "production") {
    // Rate limiting backed by per-instance memory is not rate limiting.
    throw new Error("UPSTASH_REDIS_REST_URL/TOKEN are required in production");
  }
  console.warn("[services] Upstash not configured — using in-memory cache (dev only)");
  return new MemoryCache();
}

function buildServices() {
  // Fail fast on invalid configuration (NFR boot validation)
  const env = loadServerEnv();
  const prisma = getPrisma(env.DATABASE_URL);

  const audit = new PrismaAuditRepository(prisma);
  const users = new PrismaUserRepository(prisma);
  const memberships = new PrismaMembershipRepository(prisma);
  const organizations = new PrismaOrganizationRepository(prisma);
  const invites = new PrismaInviteRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const events = new PrismaEventRepository(prisma);
  const sectors = new PrismaSectorRepository(prisma);
  const ticketTypes = new PrismaTicketTypeRepository(prisma);
  const batches = new PrismaSalesBatchRepository(prisma);

  const passwordHasher = new Argon2PasswordHasher();
  const cache = buildCache();

  return {
    identity: new IdentityService({
      organizations,
      memberships,
      invites,
      users,
      audit,
      clock: systemClock,
      passwordHasher,
    }),
    auth: new AuthService({
      users,
      sessions,
      audit,
      cache,
      clock: systemClock,
      passwordHasher,
    }),
    events: new EventsService({
      events,
      sectors,
      memberships,
      inventory: {
        sumBatchQuantityTotal: (orgId, eventId) =>
          batches.sumQuantityTotalByEvent(orgId, eventId),
        sumBatchCommitted: (orgId, eventId) => batches.sumCommittedByEvent(orgId, eventId),
        countBatches: (orgId, eventId) => batches.countByEvent(orgId, eventId),
      },
      audit,
      clock: systemClock,
    }),
    inventory: new InventoryService({
      ticketTypes,
      batches,
      events,
      memberships,
      audit,
    }),
  };
}

type Services = ReturnType<typeof buildServices>;

const globalForServices = globalThis as unknown as { services?: Services };

export function getServices(): Services {
  globalForServices.services ??= buildServices();
  return globalForServices.services;
}
