import type { RequestContext } from "../../shared/context";
import {
  ConflictError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../shared/errors";
import type { AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import { EVENT_MANAGER_ROLES, EVENT_TERMINAL_STATES, type EventRecord } from "../events/types";
import type { SalesBatchRepository, TicketTypeRepository } from "./repository";
import type { CreateSalesBatchInput, CreateTicketTypeInput } from "./schemas";
import { assertBatchTransition } from "./transitions";
import { committedOf, type SalesBatchRecord, type SalesBatchStatus } from "./types";

/** Read-only view of event data the inventory module needs. */
export interface EventReader {
  findByIdScoped(organizationId: string, eventId: string): Promise<EventRecord | null>;
}

export interface InventoryServiceDeps {
  ticketTypes: TicketTypeRepository;
  batches: SalesBatchRepository;
  events: EventReader;
  memberships: MembershipLookup;
  audit: AuditRepository;
}

export class InventoryService {
  constructor(private readonly deps: InventoryServiceDeps) {}

  /** FR-INV-001, FR-EVT-013. */
  async createTicketType(ctx: RequestContext, eventId: string, input: CreateTicketTypeInput) {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    await this.mustFindEditableEvent(ctx, eventId);

    const existing = await this.deps.ticketTypes.findByEventAndName(
      ctx.organizationId,
      eventId,
      input.name,
    );
    if (existing) throw new ConflictError("A ticket type with this name already exists");

    const ticketType = await this.deps.ticketTypes.create({
      organizationId: ctx.organizationId,
      eventId,
      name: input.name,
      kind: input.kind,
      sectorId: input.sectorId,
    });

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "ticket_type.created",
      resourceType: "ticket_type",
      resourceId: ticketType.id,
      after: { name: ticketType.name, kind: ticketType.kind },
      correlationId: ctx.correlationId,
    });

    return ticketType;
  }

  async listTicketTypes(ctx: RequestContext, eventId: string) {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    return this.deps.ticketTypes.listByEvent(ctx.organizationId, eventId);
  }

  /**
   * FR-INV-001/002/004 — batch creation. The aggregate of quantityTotal
   * across the event's batches must fit the event capacity, so the
   * BR-INV-001 invariant holds by construction.
   */
  async createSalesBatch(ctx: RequestContext, eventId: string, input: CreateSalesBatchInput) {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    const event = await this.mustFindEditableEvent(ctx, eventId);

    const ticketType = await this.deps.ticketTypes.findByIdScoped(
      ctx.organizationId,
      input.ticketTypeId,
    );
    if (!ticketType || ticketType.eventId !== eventId) {
      throw new NotFoundOrForbiddenError();
    }

    if (event.capacityTotal !== null) {
      const existingTotal = await this.deps.batches.sumQuantityTotalByEvent(
        ctx.organizationId,
        eventId,
      );
      if (existingTotal + input.quantityTotal > event.capacityTotal) {
        throw new ConflictError(
          `Batch quantities (${existingTotal + input.quantityTotal}) would exceed the event capacity (${event.capacityTotal})`,
        );
      }
    }

    const batch = await this.deps.batches.create({
      organizationId: ctx.organizationId,
      eventId,
      ticketTypeId: input.ticketTypeId,
      name: input.name,
      priceCents: input.priceCents,
      quantityTotal: input.quantityTotal,
      salesStartAt: input.salesStartAt,
      salesEndAt: input.salesEndAt,
      maxPerOrder: input.maxPerOrder,
    });

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "sales_batch.created",
      resourceType: "sales_batch",
      resourceId: batch.id,
      after: {
        name: batch.name,
        priceCents: batch.priceCents,
        quantityTotal: batch.quantityTotal,
      },
      correlationId: ctx.correlationId,
    });

    return batch;
  }

  async listSalesBatches(ctx: RequestContext, eventId: string) {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    return this.deps.batches.listByEvent(ctx.organizationId, eventId);
  }

  /**
   * FR-INV-009 — quantity changes are validated against what is already
   * committed and audited; after sales started, a justification is required.
   */
  async updateBatchQuantity(
    ctx: RequestContext,
    batchId: string,
    newTotal: number,
    justification?: string,
  ): Promise<SalesBatchRecord> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);

    const batch = await this.deps.batches.findByIdScoped(ctx.organizationId, batchId);
    if (!batch) throw new NotFoundOrForbiddenError();
    const event = await this.mustFindEditableEvent(ctx, batch.eventId);
    // Capture BEFORE the update — the audit trail must show the old value
    const previousTotal = batch.quantityTotal;

    const committed = committedOf(batch);
    const salesStarted = batch.status !== "SCHEDULED" || committed > 0;
    if (salesStarted && (!justification || justification.trim().length < 5)) {
      throw new ValidationFailedError(
        "A justification is required to change quantity after sales started",
      );
    }

    if (newTotal < committed) {
      throw new ConflictError(
        `Quantity cannot be reduced below the committed total (${committed})`,
      );
    }

    if (event.capacityTotal !== null) {
      const otherBatchesTotal = await this.deps.batches.sumQuantityTotalByEvent(
        ctx.organizationId,
        batch.eventId,
        batchId,
      );
      if (otherBatchesTotal + newTotal > event.capacityTotal) {
        throw new ConflictError(
          `Batch quantities (${otherBatchesTotal + newTotal}) would exceed the event capacity (${event.capacityTotal})`,
        );
      }
    }

    const updated = await this.deps.batches.updateQuantityTotal(
      ctx.organizationId,
      batchId,
      newTotal,
    );

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "sales_batch.quantity_changed",
      resourceType: "sales_batch",
      resourceId: batchId,
      justification,
      before: { quantityTotal: previousTotal },
      after: { quantityTotal: newTotal },
      correlationId: ctx.correlationId,
    });

    // A sold-out batch that regains room reopens explicitly, not silently.
    return updated;
  }

  /** Manual open — automatic opening by sales window arrives with Fase 2 cron. */
  async openBatch(ctx: RequestContext, batchId: string): Promise<SalesBatchRecord> {
    return this.transitionBatch(ctx, batchId, "OPEN");
  }

  /** FR-INV-011 — manual close. */
  async closeBatch(ctx: RequestContext, batchId: string): Promise<SalesBatchRecord> {
    return this.transitionBatch(ctx, batchId, "CLOSED");
  }

  // -------------------------------------------------------------------------

  private async transitionBatch(
    ctx: RequestContext,
    batchId: string,
    to: SalesBatchStatus,
  ): Promise<SalesBatchRecord> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);

    const batch = await this.deps.batches.findByIdScoped(ctx.organizationId, batchId);
    if (!batch) throw new NotFoundOrForbiddenError();
    await this.mustFindEditableEvent(ctx, batch.eventId);

    assertBatchTransition(batch.status, to);

    // Reopening a batch with no remaining availability makes no sense.
    if (to === "OPEN" && committedOf(batch) >= batch.quantityTotal) {
      throw new ConflictError("Batch has no remaining availability; increase quantity first");
    }

    // Capture BEFORE the update — the audit trail must show the old status
    const fromStatus = batch.status;
    const updated = await this.deps.batches.updateStatus(ctx.organizationId, batchId, to);

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "sales_batch.status_changed",
      resourceType: "sales_batch",
      resourceId: batchId,
      before: { status: fromStatus },
      after: { status: to },
      correlationId: ctx.correlationId,
    });

    return updated;
  }

  private async mustFindEditableEvent(ctx: RequestContext, eventId: string): Promise<EventRecord> {
    const event = await this.deps.events.findByIdScoped(ctx.organizationId, eventId);
    if (!event) throw new NotFoundOrForbiddenError();
    if (EVENT_TERMINAL_STATES.includes(event.status)) {
      throw new ConflictError(`Event in status ${event.status} can no longer be edited`);
    }
    return event;
  }
}
