import "server-only";

import { loadServerEnv } from "@ingressos/config";
import {
  AuthService,
  EventsService,
  IdentityService,
  InventoryService,
  NotificationsService,
  OrdersService,
  PaymentsService,
  PromotersService,
  PrismaAuditRepository,
  PrismaCommissionEntryRepository,
  PrismaCommissionRuleRepository,
  PrismaCouponRepository,
  PrismaOrderAttributionRepository,
  PrismaPromoterAssignmentRepository,
  PrismaPromoterLinkRepository,
  PrismaEventRepository,
  PrismaInviteRepository,
  PrismaMembershipRepository,
  PrismaNotificationRepository,
  PrismaOrderRepository,
  PrismaOrganizationRepository,
  PrismaPaymentEventRepository,
  PrismaPaymentRepository,
  PrismaPublicEventReader,
  PrismaReservationStore,
  PrismaSalesBatchRepository,
  PrismaSectorRepository,
  PrismaSessionRepository,
  PrismaTicketRepository,
  PrismaTicketTypeRepository,
  PrismaUserRepository,
  TicketsService,
  ValidationFailedError,
  systemClock,
  type CachePort,
  type MailerPort,
  type PspPort,
} from "@ingressos/core";
import {
  Argon2PasswordHasher,
  MailtrapAdapter,
  MemoryCache,
  MercadoPagoAdapter,
  UpstashRedisCache,
} from "@ingressos/adapters";
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

/** PSP not configured yet — fail with a clean, mappable domain error. */
function buildPsp(env: ReturnType<typeof loadServerEnv>): PspPort {
  if (env.MERCADOPAGO_ACCESS_TOKEN && env.MERCADOPAGO_WEBHOOK_SECRET) {
    return new MercadoPagoAdapter(env.MERCADOPAGO_ACCESS_TOKEN, env.MERCADOPAGO_WEBHOOK_SECRET);
  }
  const unavailable = async (): Promise<never> => {
    throw new ValidationFailedError("Pagamentos ainda não configurados neste ambiente");
  };
  return {
    createPixCharge: unavailable,
    createCardCharge: unavailable,
    refund: unavailable,
    getTransaction: unavailable,
    verifyAndParseWebhook: async () => null,
  };
}

function buildMailer(env: ReturnType<typeof loadServerEnv>): MailerPort {
  if (env.MAILTRAP_API_TOKEN && env.MAILTRAP_SENDER_EMAIL) {
    return new MailtrapAdapter(env.MAILTRAP_API_TOKEN, env.MAILTRAP_SENDER_EMAIL);
  }
  return {
    // Purchases must survive a missing mail provider (NFR-AVL-006): the
    // notification row is recorded as FAILED and retried once configured.
    send: async () => {
      throw new Error("Mail provider not configured");
    },
  };
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
  const publicEvents = new PrismaPublicEventReader(prisma);
  const reservations = new PrismaReservationStore(prisma);
  const orderRepo = new PrismaOrderRepository(prisma);
  const ticketRepo = new PrismaTicketRepository(prisma);
  const paymentRepo = new PrismaPaymentRepository(prisma);
  const paymentEventRepo = new PrismaPaymentEventRepository(prisma);
  const notificationRepo = new PrismaNotificationRepository(prisma);
  const promoterAssignments = new PrismaPromoterAssignmentRepository(prisma);
  const promoterLinks = new PrismaPromoterLinkRepository(prisma);
  const couponRepo = new PrismaCouponRepository(prisma);
  const commissionRules = new PrismaCommissionRuleRepository(prisma);
  const orderAttributions = new PrismaOrderAttributionRepository(prisma);
  const commissionEntries = new PrismaCommissionEntryRepository(prisma);

  const passwordHasher = new Argon2PasswordHasher();
  const cache = buildCache();
  const psp = buildPsp(env);
  const mailer = buildMailer(env);

  // Built before OrdersService so it can be injected as the checkout resolver
  // (coupon discount + attribution). It depends on repositories, not services.
  const promotersService = new PromotersService({
    assignments: promoterAssignments,
    links: promoterLinks,
    coupons: couponRepo,
    rules: commissionRules,
    attributions: orderAttributions,
    entries: commissionEntries,
    memberships,
    events,
    orders: orderRepo,
    audit,
    clock: systemClock,
  });

  const ordersService = new OrdersService({
    orders: orderRepo,
    reservations,
    publicEvents,
    batches,
    audit,
    clock: systemClock,
    checkout: promotersService,
  });
  const ticketsService = new TicketsService({
    tickets: ticketRepo,
    orders: orderRepo,
    audit,
  });
  const notificationsService = new NotificationsService({
    notifications: notificationRepo,
    mailer,
    baseUrl: env.APP_BASE_URL,
  });

  // Post-approval orchestration: tickets + confirmation e-mail. Idempotent
  // end to end, so webhook retries and crash-healing are safe.
  const fulfiller = {
    fulfill: async (organizationId: string, orderId: string, correlationId: string) => {
      // Commission accrual first — idempotent on its own (unique orderId+ACCRUAL),
      // so it heals even if a prior fulfillment crashed after issuing tickets.
      await promotersService
        .accrueForPaidOrder(organizationId, orderId, { correlationId })
        .catch(() => undefined);

      const issued = await ticketsService.issueForOrder(organizationId, orderId, {
        correlationId,
      });
      if (issued.length === 0) return; // retry path — tickets already exist
      const order = await orderRepo.findByIdScoped(organizationId, orderId);
      if (!order) return;
      const event = await events.findByIdScoped(organizationId, order.eventId);
      await notificationsService.sendOrderConfirmation(order, issued, {
        correlationId,
        eventTitle: event?.title,
      });
    },
  };

  const paymentsService = new PaymentsService({
    payments: paymentRepo,
    paymentEvents: paymentEventRepo,
    orders: orderRepo,
    orderCoordinator: ordersService,
    fulfiller,
    psp,
    audit,
    clock: systemClock,
    commissionCoordinator: promotersService,
  });

  return {
    cache,
    publicEvents,
    batchesRepo: batches,
    ticketTypesRepo: ticketTypes,
    orders: ordersService,
    ticketsService,
    notifications: notificationsService,
    payments: paymentsService,
    promoters: promotersService,
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
