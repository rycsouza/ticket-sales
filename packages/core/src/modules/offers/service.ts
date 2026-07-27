import type { RequestContext } from "../../shared/context";
import { NotFoundOrForbiddenError, ValidationFailedError } from "../../shared/errors";
import type { AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import type { OfferRepository, ProductRepository } from "./repository";
import {
  createOfferSchema,
  createProductSchema,
  updateOfferSchema,
  updateProductSchema,
  type CreateOfferInput,
  type CreateProductInput,
  type UpdateOfferInput,
  type UpdateProductInput,
} from "./schemas";
import { OFFER_MANAGER_ROLES, type CheckoutOfferView, type OfferRecord, type ProductRecord } from "./types";

/** Minimal batch reader — structurally satisfied by the sales-batch repo. */
export interface OfferBatchReader {
  findByIdScoped(
    organizationId: string,
    batchId: string,
  ): Promise<{
    id: string;
    eventId: string;
    ticketTypeId: string;
    status: string;
    priceCents: number;
    salesStartAt: Date | null;
    salesEndAt: Date | null;
  } | null>;
}

export interface OffersServiceDeps {
  products: ProductRepository;
  offers: OfferRepository;
  batches: OfferBatchReader;
  memberships: MembershipLookup;
  audit: AuditRepository;
}

/** Resolved checkout selections, ready to feed the order (server-priced). */
export interface ResolvedOfferSelections {
  ticketUnits: { batchId: string; ticketTypeId: string; unitPriceCents: number }[];
  products: { productId: string; description: string; unitPriceCents: number }[];
}

export class OffersService {
  constructor(private readonly deps: OffersServiceDeps) {}

  // --- Products (org-level) -------------------------------------------------

  async createProduct(ctx: RequestContext, input: CreateProductInput): Promise<ProductRecord> {
    await requireActiveRole(this.deps.memberships, ctx, OFFER_MANAGER_ROLES);
    const data = createProductSchema.parse(input);
    const product = await this.deps.products.create({
      organizationId: ctx.organizationId,
      name: data.name,
      description: data.description,
      priceCents: data.priceCents,
    });
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "product.created",
      resourceType: "product",
      resourceId: product.id,
      after: { name: product.name, priceCents: product.priceCents },
      correlationId: ctx.correlationId,
    });
    return product;
  }

  async listProducts(ctx: RequestContext): Promise<ProductRecord[]> {
    await requireActiveRole(this.deps.memberships, ctx, OFFER_MANAGER_ROLES);
    return this.deps.products.listByOrganization(ctx.organizationId);
  }

  async updateProduct(
    ctx: RequestContext,
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductRecord> {
    await requireActiveRole(this.deps.memberships, ctx, OFFER_MANAGER_ROLES);
    const data = updateProductSchema.parse(input);
    const updated = await this.deps.products.update(ctx.organizationId, id, data);
    if (!updated) throw new NotFoundOrForbiddenError();
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "product.updated",
      resourceType: "product",
      resourceId: id,
      after: { name: updated.name, priceCents: updated.priceCents, active: updated.active },
      correlationId: ctx.correlationId,
    });
    return updated;
  }

  // --- Offers (org-level) ---------------------------------------------------

  async createOffer(ctx: RequestContext, input: CreateOfferInput): Promise<OfferRecord> {
    await requireActiveRole(this.deps.memberships, ctx, OFFER_MANAGER_ROLES);
    const data = createOfferSchema.parse(input);

    let eventId = data.eventId ?? null;
    if (data.batchId) {
      // A ticket-target offer is bound to its batch's event — the batch must
      // exist in this org, and its event overrides any supplied eventId.
      const batch = await this.deps.batches.findByIdScoped(ctx.organizationId, data.batchId);
      if (!batch) throw new NotFoundOrForbiddenError();
      eventId = batch.eventId;
    } else if (data.productId) {
      const product = await this.deps.products.findById(ctx.organizationId, data.productId);
      if (!product) throw new NotFoundOrForbiddenError();
    }

    const offer = await this.deps.offers.create({
      organizationId: ctx.organizationId,
      kind: data.kind,
      eventId,
      batchId: data.batchId,
      productId: data.productId,
      title: data.title,
      description: data.description,
      priceCentsOverride: data.priceCentsOverride,
      sortOrder: data.sortOrder,
    });
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "offer.created",
      resourceType: "offer",
      resourceId: offer.id,
      after: { kind: offer.kind, eventId: offer.eventId },
      correlationId: ctx.correlationId,
    });
    return offer;
  }

  async listOffers(ctx: RequestContext): Promise<OfferRecord[]> {
    await requireActiveRole(this.deps.memberships, ctx, OFFER_MANAGER_ROLES);
    return this.deps.offers.listByOrganization(ctx.organizationId);
  }

  async updateOffer(ctx: RequestContext, id: string, input: UpdateOfferInput): Promise<OfferRecord> {
    await requireActiveRole(this.deps.memberships, ctx, OFFER_MANAGER_ROLES);
    const data = updateOfferSchema.parse(input);
    const updated = await this.deps.offers.update(ctx.organizationId, id, data);
    if (!updated) throw new NotFoundOrForbiddenError();
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "offer.updated",
      resourceType: "offer",
      resourceId: id,
      after: { active: updated.active },
      correlationId: ctx.correlationId,
    });
    return updated;
  }

  // --- Checkout (public reads) ---------------------------------------------

  /**
   * Offers to display on an event's checkout, server-priced. Offers whose
   * target is inactive or not currently sellable are omitted, so the buyer only
   * ever sees things they can actually add.
   */
  async listForCheckout(organizationId: string, eventId: string): Promise<CheckoutOfferView[]> {
    const offers = await this.deps.offers.listActiveForEvent(organizationId, eventId);
    const views: CheckoutOfferView[] = [];
    for (const offer of offers) {
      if (offer.productId) {
        const product = await this.deps.products.findById(organizationId, offer.productId);
        if (!product || !product.active) continue;
        views.push({
          id: offer.id,
          kind: offer.kind,
          title: offer.title ?? product.name,
          description: offer.description ?? product.description,
          priceCents: offer.priceCentsOverride ?? product.priceCents,
          originalPriceCents: null,
        });
      } else if (offer.batchId) {
        const batch = await this.deps.batches.findByIdScoped(organizationId, offer.batchId);
        if (!batch || batch.eventId !== eventId || batch.status !== "OPEN") continue;
        const priceCents = offer.priceCentsOverride ?? batch.priceCents;
        views.push({
          id: offer.id,
          kind: offer.kind,
          title: offer.title ?? "Ingresso adicional",
          description: offer.description,
          priceCents,
          originalPriceCents: priceCents < batch.priceCents ? batch.priceCents : null,
        });
      }
    }
    return views;
  }

  /**
   * Resolves buyer-selected offers into priced order lines (server-side only).
   * Throws ValidationFailedError on any invalid/unavailable offer so the whole
   * checkout rejects rather than silently dropping a paid add-on.
   */
  async resolveSelections(input: {
    organizationId: string;
    eventId: string;
    selections: { offerId: string; quantity: number }[];
    now: Date;
  }): Promise<ResolvedOfferSelections> {
    const ticketUnits: ResolvedOfferSelections["ticketUnits"] = [];
    const products: ResolvedOfferSelections["products"] = [];

    for (const selection of input.selections) {
      const offer = await this.deps.offers.findById(input.organizationId, selection.offerId);
      if (!offer || !offer.active) throw new ValidationFailedError("Oferta indisponível.");
      if (offer.eventId !== null && offer.eventId !== input.eventId) {
        throw new ValidationFailedError("Oferta indisponível para este evento.");
      }

      if (offer.productId) {
        const product = await this.deps.products.findById(input.organizationId, offer.productId);
        if (!product || !product.active) throw new ValidationFailedError("Produto indisponível.");
        const unitPriceCents = offer.priceCentsOverride ?? product.priceCents;
        for (let i = 0; i < selection.quantity; i++) {
          products.push({ productId: product.id, description: product.name, unitPriceCents });
        }
      } else if (offer.batchId) {
        const batch = await this.deps.batches.findByIdScoped(input.organizationId, offer.batchId);
        if (!batch || batch.eventId !== input.eventId || batch.status !== "OPEN") {
          throw new ValidationFailedError("Ingresso da oferta indisponível.");
        }
        if (
          (batch.salesStartAt && input.now < batch.salesStartAt) ||
          (batch.salesEndAt && input.now > batch.salesEndAt)
        ) {
          throw new ValidationFailedError("Ingresso da oferta fora da janela de venda.");
        }
        const unitPriceCents = offer.priceCentsOverride ?? batch.priceCents;
        for (let i = 0; i < selection.quantity; i++) {
          ticketUnits.push({
            batchId: batch.id,
            ticketTypeId: batch.ticketTypeId,
            unitPriceCents,
          });
        }
      }
    }

    return { ticketUnits, products };
  }
}
