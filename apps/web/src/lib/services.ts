import "server-only";

import { loadServerEnv } from "@ingressos/config";
import {
  AuthService,
  CheckinService,
  CustomersService,
  EventPageService,
  EventsService,
  FinanceService,
  IdentityService,
  InventoryService,
  NotificationsService,
  OffersService,
  OrdersService,
  PaymentsService,
  PromotersService,
  PrismaAuditRepository,
  PrismaPlatformAuditRepository,
  PrismaCommissionEntryRepository,
  PrismaCommissionRuleRepository,
  PrismaCouponRepository,
  PrismaOrderAttributionRepository,
  PrismaOrderNoteRepository,
  PrismaPromoterRepository,
  PrismaPromoterAssignmentRepository,
  PrismaPromoterLinkRepository,
  SupportService,
  PrismaCheckinAssignmentRepository,
  PrismaCheckinRepository,
  PrismaCustomerRepository,
  PrismaEventPageRepository,
  PrismaEventRepository,
  PrismaInviteRepository,
  PrismaLedgerRepository,
  PrismaMembershipRepository,
  PrismaNotificationRepository,
  PrismaOfferRepository,
  PrismaProductRepository,
  PrismaOrderRepository,
  PrismaOrganizationRepository,
  PrismaPaymentEventRepository,
  PrismaPaymentRepository,
  PrismaPublicEventPageReader,
  PrismaPublicEventReader,
  PrismaPublicOrganizationReader,
  PrismaPublicRefRepository,
  NotFoundOrForbiddenError,
  PrismaReservationStore,
  PrismaSalesBatchRepository,
  PrismaSectorRepository,
  PrismaSessionRepository,
  PrismaTicketRepository,
  PrismaTrustedDeviceRepository,
  PrismaTicketTypeRepository,
  PrismaUserRepository,
  TicketsService,
  ValidationFailedError,
  loadKey,
  orderAccessCacheKey,
  systemClock,
  type CachePort,
  type MailerPort,
  type PspPort,
  type PublicImageStoragePort,
} from "@ingressos/core";
import {
  Argon2PasswordHasher,
  CloudinaryAdapter,
  MailtrapAdapter,
  MemoryCache,
  MercadoPagoAdapter,
  UpstashRedisCache,
} from "@ingressos/adapters";
import { getPlatformPrisma, TenantDbResolver, type PrismaClient } from "@ingressos/db";

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

/**
 * Imagens públicas (logo/banner/favicon da página do evento) via Cloudinary.
 * Sem env, o resto do editor funciona e o upload devolve um 400 amigável
 * (padrão buildPsp).
 */
function buildPublicImageStorage(env: ReturnType<typeof loadServerEnv>): PublicImageStoragePort {
  if (env.CLOUDINARY_URL) {
    return new CloudinaryAdapter(env.CLOUDINARY_URL);
  }
  return {
    upload: async () => {
      throw new ValidationFailedError("Upload de imagens não configurado neste ambiente");
    },
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

/**
 * Plano de CONTROLE (docs/MULTITENANT.md §2.1) — identidade global (users,
 * sessões, memberships, convites, organizações), auditoria de plataforma e
 * dedupe de webhook. Roda no PLATFORM DB, obrigatório desde o MT-2: um usuário
 * pertence a N orgs e no login o tenant ainda não é conhecido.
 */
function buildPlatformServices() {
  const env = loadServerEnv();
  if (!env.PLATFORM_DATABASE_URL) {
    // Fail fast e claro: sem o plano de controle não existe login nem tenant.
    throw new Error(
      "PLATFORM_DATABASE_URL is required since MT-2 (multi-tenant control plane — docs/MULTITENANT.md §9)",
    );
  }
  const prisma = getPlatformPrisma(env.PLATFORM_DATABASE_URL);

  const audit = new PrismaPlatformAuditRepository(prisma);
  const users = new PrismaUserRepository(prisma);
  const memberships = new PrismaMembershipRepository(prisma);
  const organizations = new PrismaOrganizationRepository(prisma);
  const invites = new PrismaInviteRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const trustedDevices = new PrismaTrustedDeviceRepository(prisma);
  const publicOrganizations = new PrismaPublicOrganizationReader(prisma);
  const paymentEvents = new PrismaPaymentEventRepository(prisma);
  // Roteamento por identificador público (docs/MULTITENANT.md §2.1/§3).
  const refs = new PrismaPublicRefRepository(prisma);
  // Enumeração de tenants ATIVOS — usada pelos jobs cross-tenant (fan-out) e
  // pelo sitemap. Só ids: nada de URL/segredo sai daqui.
  const tenants = {
    listActive: async (): Promise<{ id: string }[]> =>
      prisma.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true } }),
  };

  const passwordHasher = new Argon2PasswordHasher();
  const cache = buildCache();
  const mailer = buildMailer(env);
  // 1 conta de PSP para a plataforma inteira (DEC-002 — recebedora única). O
  // webhook verifica a assinatura AQUI, antes de saber o tenant.
  const psp = buildPsp(env);

  const auth = new AuthService({
    users,
    sessions,
    audit,
    cache,
    clock: systemClock,
    passwordHasher,
    // DEC-012: TOTP MFA is enforced only when the encryption key is configured.
    ...(env.MFA_ENCRYPTION_KEY
      ? {
          mfa: {
            key: loadKey(env.MFA_ENCRYPTION_KEY),
            issuer: "Ingressos",
            trustedDevices,
          },
        }
      : {}),
    // E-mail 2FA — enabled by flag + a real mailer; takes precedence over TOTP.
    ...(env.EMAIL_2FA_ENABLED === "true" && env.MAILTRAP_API_TOKEN
      ? {
          email2fa: {
            mailer,
            issuer: "Ingressos",
            trustedDevices,
          },
        }
      : {}),
  });

  const identity = new IdentityService({
    organizations,
    memberships,
    invites,
    users,
    audit,
    clock: systemClock,
    passwordHasher,
  });

  return {
    audit,
    users,
    memberships,
    organizations,
    invites,
    sessions,
    trustedDevices,
    publicOrganizations,
    paymentEvents,
    refs,
    tenants,
    cache,
    psp,
    auth,
    identity,
  };
}

type PlatformServices = ReturnType<typeof buildPlatformServices>;

/**
 * Grafo de serviços de NEGÓCIO de um tenant, montado sobre o banco DAQUELE
 * tenant (getTenantServices). Desde o MT-5 NÃO existe banco default: todo
 * acesso a dado de negócio passa pelo registro da plataforma (fail-closed).
 */
function buildServices(tenantPrisma: PrismaClient) {
  // Fail fast on invalid configuration (NFR boot validation)
  const env = loadServerEnv();
  const prisma = tenantPrisma;

  // Identity/auth live on the PLATFORM DB (MT-2) — tenant services receive the
  // platform-backed repos by injection (cross-DB object graph, same contracts).
  const platform = getPlatformServices();
  const memberships = platform.memberships;
  const organizations = platform.organizations;
  const publicOrganizations = platform.publicOrganizations;
  // Reservas/roteamento de identificadores públicos (docs/MULTITENANT.md §3).
  const refs = platform.refs;

  const audit = new PrismaAuditRepository(prisma);
  const events = new PrismaEventRepository(prisma);
  const eventPages = new PrismaEventPageRepository(prisma);
  const publicEventPages = new PrismaPublicEventPageReader(prisma);
  const sectors = new PrismaSectorRepository(prisma);
  const ticketTypes = new PrismaTicketTypeRepository(prisma);
  const batches = new PrismaSalesBatchRepository(prisma);
  const publicEvents = new PrismaPublicEventReader(prisma);
  const reservations = new PrismaReservationStore(prisma);
  const orderRepo = new PrismaOrderRepository(prisma);
  const ticketRepo = new PrismaTicketRepository(prisma);
  const paymentRepo = new PrismaPaymentRepository(prisma);
  // Webhook dedupe is global — lives on the platform DB (MT-2/3).
  const paymentEventRepo = platform.paymentEvents;
  const notificationRepo = new PrismaNotificationRepository(prisma);
  const promoterRepo = new PrismaPromoterRepository(prisma);
  const promoterAssignments = new PrismaPromoterAssignmentRepository(prisma);
  const promoterLinks = new PrismaPromoterLinkRepository(prisma);
  const couponRepo = new PrismaCouponRepository(prisma);
  const commissionRules = new PrismaCommissionRuleRepository(prisma);
  const orderAttributions = new PrismaOrderAttributionRepository(prisma);
  const commissionEntries = new PrismaCommissionEntryRepository(prisma);
  const orderNotes = new PrismaOrderNoteRepository(prisma);
  const ledgerRepo = new PrismaLedgerRepository(prisma);
  const customerRepo = new PrismaCustomerRepository(prisma);
  const checkinAssignments = new PrismaCheckinAssignmentRepository(prisma);
  const checkinRepo = new PrismaCheckinRepository(prisma);

  const cache = buildCache();
  const psp = buildPsp(env);
  const mailer = buildMailer(env);

  // Built before OrdersService so it can be injected as the checkout resolver
  // (coupon discount + attribution). It depends on repositories, not services.
  const promotersService = new PromotersService({
    promoters: promoterRepo,
    refs,
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

  const offersService = new OffersService({
    products: new PrismaProductRepository(prisma),
    offers: new PrismaOfferRepository(prisma),
    batches,
    memberships,
    audit,
  });

  const ordersService = new OrdersService({
    orders: orderRepo,
    reservations,
    refs,
    publicEvents,
    batches,
    audit,
    clock: systemClock,
    checkout: promotersService,
    offers: offersService,
    // Buyer access tokens (Print 4): issued at checkout, resolved on the order page.
    cache,
    // Lazy: customersService is constructed below; the closure resolves it at
    // request time, letting a returning buyer reuse their data by phone.
    customerLookup: {
      resolveByPhone: (organizationId, phone) =>
        customersService.resolveByPhone(organizationId, phone),
    },
  });
  const ticketsService = new TicketsService({
    tickets: ticketRepo,
    orders: orderRepo,
    refs,
    audit,
    memberships,
    auditReader: audit,
    clock: systemClock,
  });
  const notificationsService = new NotificationsService({
    notifications: notificationRepo,
    mailer,
    baseUrl: env.APP_BASE_URL,
  });

  // Finance ledger (append-only). PSP cost is reconciled later (FR-FIN-005/006);
  // in the MVP it is 0 at posting time, so platform net = fee until reconciled.
  const financeService = new FinanceService({
    ledger: ledgerRepo,
    orders: orderRepo,
    events,
    commission: {
      getAccruedCommission: async (organizationId: string, orderId: string) => {
        const entry = await commissionEntries.findByOrderAndType(
          organizationId,
          orderId,
          "ACCRUAL",
        );
        return entry ? { promoterId: entry.promoterId, amountCents: entry.amountCents } : null;
      },
    },
    pspCost: { getOrderPspCostCents: async () => 0 },
    memberships,
    audit,
  });

  const customersService = new CustomersService({
    customers: customerRepo,
    orders: orderRepo,
    memberships,
    audit,
    clock: systemClock,
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
      // Ledger posting reads the accrued commission — must run after it.
      await financeService
        .postForPaidOrder(organizationId, orderId, { correlationId })
        .catch(() => undefined);

      const issued = await ticketsService.issueForOrder(organizationId, orderId, {
        correlationId,
      });
      if (issued.length === 0) return; // retry path — tickets already exist
      const order = await orderRepo.findByIdScoped(organizationId, orderId);
      if (!order) return;
      // CRM base — idempotent upsert of the buyer (FR-CRM-001).
      await customersService.upsertFromPaidOrder(order).catch(() => undefined);
      const event = await events.findByIdScoped(organizationId, order.eventId);
      await notificationsService.sendOrderConfirmation(order, issued, {
        correlationId,
        eventTitle: event?.title,
      });
    },
  };

  // Refund settlement across order + tickets (FR-PAY-013) — orchestrated here
  // over the two services; commission reversal stays with the promoters module.
  const refundCoordinator = {
    settleRefund: async (
      organizationId: string,
      orderId: string,
      kind: "REFUNDED" | "CHARGEBACK",
      meta: { correlationId: string },
    ) => {
      await ordersService.settleRefund(organizationId, orderId, kind, meta);
      await ticketsService.refundTicketsForOrder(organizationId, orderId, meta);
      await financeService.reverseForOrder(organizationId, orderId, meta);
    },
  };

  const paymentsService = new PaymentsService({
    payments: paymentRepo,
    refs,
    paymentEvents: paymentEventRepo,
    orders: orderRepo,
    orderCoordinator: ordersService,
    fulfiller,
    psp,
    audit,
    clock: systemClock,
    commissionCoordinator: promotersService,
    refundCoordinator,
    // Throttles gateway reconciliation on the order page (Print 5).
    cache,
  });

  return {
    cache,
    publicEvents,
    publicEventPages,
    publicOrganizations,
    batchesRepo: batches,
    ticketTypesRepo: ticketTypes,
    orders: ordersService,
    ticketsService,
    notifications: notificationsService,
    payments: paymentsService,
    promoters: promotersService,
    offers: offersService,
    finance: financeService,
    customers: customersService,
    checkin: new CheckinService({
      assignments: checkinAssignments,
      checkins: checkinRepo,
      tickets: ticketRepo,
      events,
      memberships,
      audit,
      clock: systemClock,
    }),
    support: new SupportService({
      notes: orderNotes,
      orders: orderRepo,
      payments: paymentRepo,
      tickets: ticketRepo,
      audit,
      memberships,
      clock: systemClock,
    }),
    // Identity/auth are PLATFORM services (MT-2) — exposed here so the 200+
    // existing call sites keep working unchanged.
    identity: platform.identity,
    auth: platform.auth,
    events: new EventsService({
      events,
      sectors,
      refs,
      memberships,
      inventory: {
        sumBatchQuantityTotal: (orgId, eventId) =>
          batches.sumQuantityTotalByEvent(orgId, eventId),
        sumBatchCommitted: (orgId, eventId) => batches.sumCommittedByEvent(orgId, eventId),
        countBatches: (orgId, eventId) => batches.countByEvent(orgId, eventId),
      },
      // DEC-003: new events inherit the org's default platform fee.
      organizations: {
        getFeeDefaults: async (orgId) => {
          const org = await organizations.findById(orgId);
          return {
            platformFeeBps: org?.defaultPlatformFeeBps ?? 0,
            feeMode: org?.defaultFeeMode ?? "PRODUCER",
          };
        },
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
    eventPage: new EventPageService({
      pages: eventPages,
      events,
      memberships,
      audit,
      images: buildPublicImageStorage(env),
    }),
  };
}

type Services = ReturnType<typeof buildServices>;

const globalForServices = globalThis as unknown as {
  platformServices?: PlatformServices;
  tenantServices?: Map<string, Services>;
  tenantResolver?: TenantDbResolver;
};

/** Plano de controle: identidade global + roteamento (docs/MULTITENANT.md). */
export function getPlatformServices(): PlatformServices {
  globalForServices.platformServices ??= buildPlatformServices();
  return globalForServices.platformServices;
}

/**
 * Grafo de serviços do TENANT resolvido pelo plano de controle
 * (docs/MULTITENANT.md §3–4): orgId → Tenant ACTIVE → URL decifrada → client →
 * grafo, cacheado por org por instância. Fail-closed: org desconhecida,
 * suspensa ou indecifrável vira o MESMO 404 genérico de recurso inexistente
 * (anti-enumeração) — nunca um erro que confirme a existência do tenant.
 */
export async function getTenantServices(organizationId: string): Promise<Services> {
  const cache = (globalForServices.tenantServices ??= new Map<string, Services>());
  const hit = cache.get(organizationId);
  if (hit) return hit;

  const env = loadServerEnv();
  if (!env.PLATFORM_DATABASE_URL || !env.ENCRYPTION_KEY_PLATFORM_DB) {
    throw new Error(
      "PLATFORM_DATABASE_URL and ENCRYPTION_KEY_PLATFORM_DB are required (docs/MULTITENANT.md §9)",
    );
  }
  globalForServices.tenantResolver ??= new TenantDbResolver({
    platformUrl: env.PLATFORM_DATABASE_URL,
    encryptionKeyHex: env.ENCRYPTION_KEY_PLATFORM_DB,
  });

  let client: PrismaClient;
  try {
    client = await globalForServices.tenantResolver.getTenantDb(organizationId);
  } catch {
    // TenantResolutionError (ou qualquer falha de resolução) → 404 genérico.
    throw new NotFoundOrForbiddenError();
  }
  const services = buildServices(client);
  cache.set(organizationId, services);
  return services;
}

/** TTL do cache de resolução de refs — refs são imutáveis; 24h é conservador. */
const REF_CACHE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Resolve um identificador público → orgId via plataforma, com cache Redis
 * (chave SEMPRE escopada pela ref — nunca mistura tenants). Retorna null para
 * ref desconhecida; a borda mapeia para 404 genérico.
 */
export async function resolveOrgByRef(
  kind: Parameters<PlatformServices["refs"]["resolve"]>[0],
  key: string,
): Promise<string | null> {
  const platform = getPlatformServices();
  const cacheKey = `tenant:ref:${kind}:${key}`;
  const cached = await platform.cache.get(cacheKey).catch(() => null);
  if (cached) return cached;
  const organizationId = await platform.refs.resolve(kind, key);
  if (organizationId) {
    await platform.cache.set(cacheKey, organizationId, REF_CACHE_TTL_SECONDS).catch(() => undefined);
  }
  return organizationId;
}

/**
 * Açúcar para a borda pública: resolve a ref e devolve o grafo do tenant dono,
 * ou lança o 404 genérico quando a ref não existe (fail-closed).
 */
export async function getTenantServicesByRef(
  kind: Parameters<PlatformServices["refs"]["resolve"]>[0],
  key: string,
): Promise<{ organizationId: string; services: Services }> {
  const organizationId = await resolveOrgByRef(kind, key);
  if (!organizationId) throw new NotFoundOrForbiddenError();
  return { organizationId, services: await getTenantServices(organizationId) };
}

/**
 * Roteia o acesso de comprador a um pedido (token forte OU código+e-mail) para
 * o tenant dono. O token resolve pelo cache compartilhado (o payload já carrega
 * a org); o código resolve por PublicRef. Credencial desconhecida → 404 genérico
 * — indistinguível de pedido inexistente (anti-enumeração).
 */
export async function getTenantServicesForOrderAccess(input: {
  token?: string | undefined;
  code?: string | undefined;
}): Promise<Services> {
  if (input.token) {
    const raw = await getPlatformServices().cache.get(orderAccessCacheKey(input.token));
    if (!raw) throw new NotFoundOrForbiddenError();
    try {
      const parsed = JSON.parse(raw) as { organizationId?: string };
      if (!parsed.organizationId) throw new Error("bad payload");
      return await getTenantServices(parsed.organizationId);
    } catch {
      throw new NotFoundOrForbiddenError();
    }
  }
  if (input.code) {
    const organizationId = await resolveOrgByRef("ORDER_CODE", input.code);
    if (!organizationId) throw new NotFoundOrForbiddenError();
    return getTenantServices(organizationId);
  }
  throw new NotFoundOrForbiddenError();
}
