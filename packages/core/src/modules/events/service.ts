import type { RequestContext } from "../../shared/context";
import {
  ConflictError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../shared/errors";
import type { ClockPort } from "../../ports/clock";
import type { AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import type { EventRepository, SectorRepository } from "./repository";
import type { CreateEventInput, CreateSectorInput, UpdateEventInput } from "./schemas";
import { assertEventTransition } from "./transitions";
import {
  EVENT_MANAGER_ROLES,
  EVENT_TERMINAL_STATES,
  type EventRecord,
  type EventStatus,
} from "./types";

/**
 * Read-only view of inventory data the events module needs. Implemented by
 * the inventory module (or a fake in tests) — events never touches inventory
 * tables directly (AGENTS.md module boundary).
 */
export interface InventoryReader {
  /** Sum of quantityTotal across every batch of the event. */
  sumBatchQuantityTotal(organizationId: string, eventId: string): Promise<number>;
  /** Sum of sold + reserved across every batch of the event. */
  sumBatchCommitted(organizationId: string, eventId: string): Promise<number>;
  countBatches(organizationId: string, eventId: string): Promise<number>;
}

export interface EventsServiceDeps {
  events: EventRepository;
  sectors: SectorRepository;
  memberships: MembershipLookup;
  inventory: InventoryReader;
  audit: AuditRepository;
  clock: ClockPort;
}

export class EventsService {
  constructor(private readonly deps: EventsServiceDeps) {}

  /** FR-EVT-001/002 — created as DRAFT. */
  async createEvent(ctx: RequestContext, input: CreateEventInput): Promise<EventRecord> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);

    // Public URL is /evento/<slug> — slug is globally unique. Keep the client's
    // slug when free; otherwise append a numeric suffix (never fail on it).
    const slug = await this.resolveUniqueSlug(input.slug);
    const event = await this.deps.events.create({
      organizationId: ctx.organizationId,
      ...input,
      slug,
    });

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "event.created",
      resourceType: "event",
      resourceId: event.id,
      after: { title: event.title, slug: event.slug },
      correlationId: ctx.correlationId,
    });

    return event;
  }

  /** Ensure a globally-unique slug, appending -2, -3… when the base is taken. */
  private async resolveUniqueSlug(base: string): Promise<string> {
    if (!(await this.deps.events.findAnyBySlug(base))) return base;
    for (let n = 2; n <= 100; n++) {
      const candidate = `${base}-${n}`;
      if (!(await this.deps.events.findAnyBySlug(candidate))) return candidate;
    }
    return `${base}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async getEvent(ctx: RequestContext, eventId: string): Promise<EventRecord> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    return this.mustFindEditable(ctx, eventId, { allowTerminal: true });
  }

  async listEvents(ctx: RequestContext): Promise<EventRecord[]> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    return this.deps.events.listByOrganization(ctx.organizationId);
  }

  /** FR-EVT-001 — details editing; capacity has its own audited use case. */
  async updateEventDetails(
    ctx: RequestContext,
    eventId: string,
    input: UpdateEventInput,
  ): Promise<EventRecord> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    const event = await this.mustFindEditable(ctx, eventId);

    const changedKeys = Object.keys(input) as (keyof UpdateEventInput)[];
    if (changedKeys.length === 0) return event;

    // Capture BEFORE the update — the audit trail must show the old values
    const before = pick(event, changedKeys);
    const updated = await this.deps.events.updateDetails(ctx.organizationId, eventId, input);

    // FR-EVT-010: date changes are part of the tracked history
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "event.updated",
      resourceType: "event",
      resourceId: eventId,
      before,
      after: pick(updated, changedKeys),
      correlationId: ctx.correlationId,
    });

    return updated;
  }

  /** FR-EVT-003/010, BR-INV-004 — audited, never below what is committed. */
  async changeEventCapacity(
    ctx: RequestContext,
    eventId: string,
    newCapacity: number,
    justification: string,
  ): Promise<EventRecord> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    if (!Number.isInteger(newCapacity) || newCapacity <= 0) {
      throw new ValidationFailedError("Capacity must be a positive integer");
    }
    if (!justification || justification.trim().length < 5) {
      throw new ValidationFailedError("A justification is required to change capacity");
    }

    const event = await this.mustFindEditable(ctx, eventId);
    // Capture BEFORE the update — the audit trail must show the old value
    const previousCapacity = event.capacityTotal;

    const committed = await this.deps.inventory.sumBatchCommitted(ctx.organizationId, eventId);
    if (newCapacity < committed) {
      throw new ConflictError(
        `Capacity cannot be reduced below the committed total (${committed})`,
      );
    }

    // FR-INV-004: aggregate batch quantity must keep fitting the capacity
    const batchTotal = await this.deps.inventory.sumBatchQuantityTotal(
      ctx.organizationId,
      eventId,
    );
    if (newCapacity < batchTotal) {
      throw new ConflictError(
        `Capacity cannot be reduced below the total configured in batches (${batchTotal}); reduce batches first`,
      );
    }

    const updated = await this.deps.events.updateCapacity(ctx.organizationId, eventId, newCapacity);

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "event.capacity_changed",
      resourceType: "event",
      resourceId: eventId,
      justification,
      before: { capacityTotal: previousCapacity },
      after: { capacityTotal: newCapacity },
      correlationId: ctx.correlationId,
    });

    return updated;
  }

  /** FR-EVT-005 — publication validates completeness; DRAFT|POSTPONED → PUBLISHED. */
  async publishEvent(ctx: RequestContext, eventId: string): Promise<EventRecord> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    const event = await this.mustFindEditable(ctx, eventId);
    assertEventTransition(event.status, "PUBLISHED");

    const missing: string[] = [];
    if (!event.startsAt) missing.push("startsAt");
    if (!event.venueName) missing.push("venueName");
    if (!event.city) missing.push("city");
    if (!event.capacityTotal) missing.push("capacityTotal");
    const batches = await this.deps.inventory.countBatches(ctx.organizationId, eventId);
    if (batches === 0) missing.push("at least one sales batch");
    if (missing.length > 0) {
      throw new ValidationFailedError(`Event is not ready to publish: missing ${missing.join(", ")}`);
    }

    return this.transition(ctx, event, "PUBLISHED", {
      fields: event.publishedAt ? {} : { publishedAt: this.deps.clock.now() },
    });
  }

  /** FR-EVT-006 — pause keeps the public page up. */
  async pauseSales(ctx: RequestContext, eventId: string): Promise<EventRecord> {
    return this.simpleTransition(ctx, eventId, "SALES_PAUSED");
  }

  async resumeSales(ctx: RequestContext, eventId: string): Promise<EventRecord> {
    return this.simpleTransition(ctx, eventId, "PUBLISHED");
  }

  async closeSales(ctx: RequestContext, eventId: string): Promise<EventRecord> {
    return this.simpleTransition(ctx, eventId, "SALES_CLOSED");
  }

  async postponeEvent(
    ctx: RequestContext,
    eventId: string,
    justification: string,
  ): Promise<EventRecord> {
    return this.simpleTransition(ctx, eventId, "POSTPONED", justification);
  }

  /** Terminal for sales; buyers get notified in later phases (FR-NOT-005). */
  async cancelEvent(
    ctx: RequestContext,
    eventId: string,
    justification: string,
  ): Promise<EventRecord> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    if (!justification || justification.trim().length < 5) {
      throw new ValidationFailedError("A justification is required to cancel an event");
    }
    const event = await this.mustFindEditable(ctx, eventId);
    assertEventTransition(event.status, "CANCELLED");
    return this.transition(ctx, event, "CANCELLED", {
      justification,
      fields: { cancelledAt: this.deps.clock.now() },
    });
  }

  /** PRD §11.1: COMPLETED depends on operational closure, not just time. */
  async completeEvent(ctx: RequestContext, eventId: string): Promise<EventRecord> {
    return this.simpleTransition(ctx, eventId, "COMPLETED");
  }

  async archiveEvent(ctx: RequestContext, eventId: string): Promise<EventRecord> {
    return this.simpleTransition(ctx, eventId, "ARCHIVED");
  }

  /** FR-EVT-011 — sectors without numbered seats. */
  async createSector(
    ctx: RequestContext,
    eventId: string,
    input: CreateSectorInput,
  ) {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    const event = await this.mustFindEditable(ctx, eventId);

    const existing = await this.deps.sectors.findByEventAndName(
      ctx.organizationId,
      eventId,
      input.name,
    );
    if (existing) throw new ConflictError("A sector with this name already exists");

    if (input.capacity !== undefined && event.capacityTotal !== null) {
      const sectors = await this.deps.sectors.listByEvent(ctx.organizationId, eventId);
      const sectorTotal = sectors.reduce((sum, sector) => sum + (sector.capacity ?? 0), 0);
      if (sectorTotal + input.capacity > event.capacityTotal) {
        throw new ConflictError("Sector capacities cannot exceed the event capacity");
      }
    }

    const sector = await this.deps.sectors.create({
      organizationId: ctx.organizationId,
      eventId,
      name: input.name,
      capacity: input.capacity,
    });

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "sector.created",
      resourceType: "sector",
      resourceId: sector.id,
      after: { name: sector.name, capacity: sector.capacity },
      correlationId: ctx.correlationId,
    });

    return sector;
  }

  async listSectors(ctx: RequestContext, eventId: string) {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    await this.mustFindEditable(ctx, eventId, { allowTerminal: true });
    return this.deps.sectors.listByEvent(ctx.organizationId, eventId);
  }

  // -------------------------------------------------------------------------

  private async simpleTransition(
    ctx: RequestContext,
    eventId: string,
    to: EventStatus,
    justification?: string,
  ): Promise<EventRecord> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    const event = await this.mustFindEditable(ctx, eventId, { allowTerminal: true });
    assertEventTransition(event.status, to);
    return this.transition(ctx, event, to, justification ? { justification } : {});
  }

  private async transition(
    ctx: RequestContext,
    event: EventRecord,
    to: EventStatus,
    opts: {
      justification?: string;
      fields?: { publishedAt?: Date; cancelledAt?: Date };
    },
  ): Promise<EventRecord> {
    // Capture BEFORE the update — the audit trail must show the old status
    const fromStatus = event.status;
    const updated = await this.deps.events.updateStatus(
      ctx.organizationId,
      event.id,
      to,
      opts.fields ?? {},
    );

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "event.status_changed",
      resourceType: "event",
      resourceId: event.id,
      justification: opts.justification,
      before: { status: fromStatus },
      after: { status: to },
      correlationId: ctx.correlationId,
    });

    return updated;
  }

  private async mustFindEditable(
    ctx: RequestContext,
    eventId: string,
    opts: { allowTerminal?: boolean } = {},
  ): Promise<EventRecord> {
    const event = await this.deps.events.findByIdScoped(ctx.organizationId, eventId);
    if (!event) throw new NotFoundOrForbiddenError();
    if (!opts.allowTerminal && EVENT_TERMINAL_STATES.includes(event.status)) {
      throw new ConflictError(`Event in status ${event.status} can no longer be edited`);
    }
    return event;
  }
}

function pick<T extends object>(obj: T, keys: readonly (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const key of keys) {
    if (key in obj) out[key] = obj[key];
  }
  return out;
}
