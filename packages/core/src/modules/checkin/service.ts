import type { RequestContext } from "../../shared/context";
import {
  ConflictError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../shared/errors";
import { hashToken } from "../../shared/tokens";
import type { ClockPort } from "../../ports/clock";
import type { AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import type { MembershipRecord } from "../identity/types";
import type { TicketStatus } from "../tickets/types";
import type { CheckinAssignmentRepository, CheckinRepository } from "./repository";
import type {
  AssignOperatorInput,
  ManualCheckinInput,
  SyncBatchInput,
  UndoCheckinInput,
  ValidateTicketInput,
} from "./schemas";
import {
  CHECKIN_ASSIGNABLE_ROLES,
  CHECKIN_COORDINATOR_ROLES,
  CHECKIN_OPERATOR_ROLES,
  type CheckinAssignmentRecord,
  type CheckinDashboard,
  type CheckinMode,
  type CheckinRejectionReason,
  type CheckinValidation,
  type SyncItemResult,
} from "./types";

export interface CheckinTicketReader {
  findByTokenHash(tokenHash: string): Promise<{
    id: string;
    organizationId: string;
    eventId: string;
    ticketTypeId: string;
    status: TicketStatus;
    participantName: string | null;
  } | null>;
  findByIdScoped(
    organizationId: string,
    ticketId: string,
  ): Promise<{
    id: string;
    eventId: string;
    ticketTypeId: string;
    status: TicketStatus;
    participantName: string | null;
  } | null>;
  updateStatus(
    organizationId: string,
    ticketId: string,
    from: TicketStatus[],
    to: TicketStatus,
  ): Promise<boolean>;
  listValidForEvent(
    organizationId: string,
    eventId: string,
  ): Promise<
    { id: string; tokenHash: string; ticketTypeId: string; participantName: string | null }[]
  >;
  countByEventStatuses(
    organizationId: string,
    eventId: string,
    statuses: TicketStatus[],
  ): Promise<number>;
}

export interface CheckinEventReader {
  findByIdScoped(organizationId: string, eventId: string): Promise<{ id: string } | null>;
}

export interface CheckinMembershipReader extends MembershipLookup {
  findByIdScoped(
    organizationId: string,
    membershipId: string,
  ): Promise<MembershipRecord | null>;
}

export interface CheckinServiceDeps {
  assignments: CheckinAssignmentRepository;
  checkins: CheckinRepository;
  tickets: CheckinTicketReader;
  events: CheckinEventReader;
  memberships: CheckinMembershipReader;
  audit: AuditRepository;
  clock: ClockPort;
}

const STATUS_REASON: Partial<Record<TicketStatus, CheckinRejectionReason>> = {
  PENDING_ISSUE: "not_issued",
  BLOCKED: "blocked",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
  CHECKED_IN: "already_checked_in",
};

export class CheckinService {
  constructor(private readonly deps: CheckinServiceDeps) {}

  // --- operators (FR-CIN-001/002) ------------------------------------------

  async assignOperator(ctx: RequestContext, eventId: string, input: AssignOperatorInput) {
    await requireActiveRole(this.deps.memberships, ctx, CHECKIN_COORDINATOR_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    const membership = await this.deps.memberships.findByIdScoped(
      ctx.organizationId,
      input.membershipId,
    );
    if (!membership || !CHECKIN_ASSIGNABLE_ROLES.includes(membership.role)) {
      throw new ValidationFailedError("Membership is not a gate operator/coordinator");
    }
    const assignment = await this.deps.assignments.upsert({
      organizationId: ctx.organizationId,
      eventId,
      membershipId: input.membershipId,
      sectorId: input.sectorId,
    });
    await this.audit(ctx, "checkin.operator_assigned", "checkin_assignment", assignment.id, {
      membershipId: input.membershipId,
    });
    return assignment;
  }

  async listOperators(
    ctx: RequestContext,
    eventId: string,
  ): Promise<CheckinAssignmentRecord[]> {
    await requireActiveRole(this.deps.memberships, ctx, CHECKIN_COORDINATOR_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    return this.deps.assignments.listByEvent(ctx.organizationId, eventId);
  }

  async revokeOperator(ctx: RequestContext, eventId: string, membershipId: string) {
    await requireActiveRole(this.deps.memberships, ctx, CHECKIN_COORDINATOR_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    const assignment = await this.deps.assignments.setActive(
      ctx.organizationId,
      eventId,
      membershipId,
      false,
    );
    await this.audit(ctx, "checkin.operator_revoked", "checkin_assignment", assignment.id, {
      membershipId,
    });
    return assignment;
  }

  // --- online validation (FR-CIN-003..007) ---------------------------------

  async validateAndCheckIn(
    ctx: RequestContext,
    eventId: string,
    input: ValidateTicketInput,
  ): Promise<CheckinValidation> {
    const operator = await this.requireEventOperator(ctx, eventId);
    const ticket = await this.deps.tickets.findByTokenHash(hashToken(input.token));
    if (!ticket || ticket.organizationId !== ctx.organizationId) {
      return { accepted: false, reason: "not_found" };
    }
    if (ticket.eventId !== eventId) return { accepted: false, reason: "wrong_event" };

    return this.admit(ctx, {
      ticketId: ticket.id,
      eventId,
      ticketTypeId: ticket.ticketTypeId,
      participantName: ticket.participantName,
      currentStatus: ticket.status,
      operatorMembershipId: operator.id,
      mode: "ONLINE",
      manual: false,
      deviceId: input.deviceId,
      checkedInAt: this.deps.clock.now(),
    });
  }

  // --- manual admission (FR-CIN-009) ---------------------------------------

  async manualCheckIn(
    ctx: RequestContext,
    eventId: string,
    input: ManualCheckinInput,
  ): Promise<CheckinValidation> {
    const operator = await requireActiveRole(
      this.deps.memberships,
      ctx,
      CHECKIN_COORDINATOR_ROLES,
    );
    await this.mustFindEvent(ctx.organizationId, eventId);
    const ticket = await this.deps.tickets.findByIdScoped(ctx.organizationId, input.ticketId);
    if (!ticket || ticket.eventId !== eventId) throw new NotFoundOrForbiddenError();

    const result = await this.admit(ctx, {
      ticketId: ticket.id,
      eventId,
      ticketTypeId: ticket.ticketTypeId,
      participantName: ticket.participantName,
      currentStatus: ticket.status,
      operatorMembershipId: operator.id,
      mode: "ONLINE",
      manual: true,
      deviceId: input.deviceId,
      checkedInAt: this.deps.clock.now(),
      justification: input.justification,
    });
    if (result.accepted) {
      await this.audit(ctx, "checkin.manual", "ticket", ticket.id, {
        justification: input.justification,
      });
    }
    return result;
  }

  // --- undo (FR-CIN-010) ---------------------------------------------------

  async undoCheckIn(ctx: RequestContext, eventId: string, input: UndoCheckinInput) {
    await requireActiveRole(this.deps.memberships, ctx, CHECKIN_COORDINATOR_ROLES);
    await this.mustFindEvent(ctx.organizationId, eventId);
    const ticket = await this.deps.tickets.findByIdScoped(ctx.organizationId, input.ticketId);
    if (!ticket || ticket.eventId !== eventId) throw new NotFoundOrForbiddenError();
    if (ticket.status !== "CHECKED_IN") {
      throw new ConflictError("Ticket is not checked in");
    }

    const reverted = await this.deps.tickets.updateStatus(
      ctx.organizationId,
      ticket.id,
      ["CHECKED_IN"],
      "VALID",
    );
    if (!reverted) throw new ConflictError("Ticket is not checked in");
    await this.deps.checkins.deleteByTicket(ctx.organizationId, ticket.id);

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "checkin.undone",
      resourceType: "ticket",
      resourceId: ticket.id,
      justification: input.justification,
      correlationId: ctx.correlationId,
    });
  }

  // --- offline pack + sync (FR-CIN-011..017) -------------------------------

  async buildOfflinePack(ctx: RequestContext, eventId: string) {
    await this.requireEventOperator(ctx, eventId);
    const tickets = await this.deps.tickets.listValidForEvent(ctx.organizationId, eventId);
    return {
      eventId,
      // Version = issue time; the device stores it and reports it on sync
      // (FR-CIN-020). Only token HASHES travel — never raw tokens.
      version: this.deps.clock.now().toISOString(),
      tickets,
    };
  }

  async syncOfflineBatch(
    ctx: RequestContext,
    eventId: string,
    input: SyncBatchInput,
  ): Promise<{ results: SyncItemResult[] }> {
    const operator = await this.requireEventOperator(ctx, eventId);
    const now = this.deps.clock.now();
    const results: SyncItemResult[] = [];

    for (const item of input.items) {
      const ticket = await this.deps.tickets.findByTokenHash(hashToken(item.token));
      if (!ticket || ticket.organizationId !== ctx.organizationId) {
        results.push({ token: item.token, outcome: "rejected", reason: "not_found" });
        continue;
      }
      if (ticket.eventId !== eventId) {
        results.push({ token: item.token, outcome: "rejected", reason: "wrong_event" });
        continue;
      }
      if (ticket.status === "CANCELLED" || ticket.status === "REFUNDED" || ticket.status === "BLOCKED") {
        results.push({
          token: item.token,
          outcome: "rejected",
          reason: STATUS_REASON[ticket.status] ?? "not_found",
        });
        continue;
      }

      const existing = await this.deps.checkins.findByTicket(ctx.organizationId, ticket.id);
      if (existing) {
        // Same device re-syncing → idempotent duplicate; another device → conflict.
        results.push({
          token: item.token,
          outcome: existing.deviceId === input.deviceId ? "duplicate" : "conflict",
        });
        continue;
      }

      const created = await this.deps.checkins.create({
        organizationId: ctx.organizationId,
        eventId,
        ticketId: ticket.id,
        operatorMembershipId: operator.id,
        deviceId: input.deviceId,
        mode: "OFFLINE",
        manual: false,
        checkedInAt: item.checkedInAt,
        syncedAt: now,
      });
      if (!created) {
        // Lost an insert race with a concurrent sync → conflict.
        results.push({ token: item.token, outcome: "conflict" });
        continue;
      }
      await this.deps.tickets.updateStatus(
        ctx.organizationId,
        ticket.id,
        ["VALID"],
        "CHECKED_IN",
      );
      results.push({ token: item.token, outcome: "applied" });
    }

    const applied = results.filter((r) => r.outcome === "applied").length;
    const conflicts = results.filter((r) => r.outcome === "conflict").length;
    await this.audit(ctx, "checkin.offline_synced", "event", eventId, {
      deviceId: input.deviceId,
      applied,
      conflicts,
      total: input.items.length,
    });
    return { results };
  }

  // --- dashboard (FR-CIN-018) ----------------------------------------------

  async dashboard(ctx: RequestContext, eventId: string): Promise<CheckinDashboard> {
    await this.requireEventOperator(ctx, eventId);
    const sold = await this.deps.tickets.countByEventStatuses(ctx.organizationId, eventId, [
      "VALID",
      "CHECKED_IN",
    ]);
    const present = await this.deps.checkins.countByEvent(ctx.organizationId, eventId);
    const absent = Math.max(0, sold - present);
    const entryRatePercent = sold > 0 ? Math.round((present / sold) * 100) : 0;
    return { sold, present, absent, entryRatePercent };
  }

  // -------------------------------------------------------------------------

  /** Core admission: the guarded VALID→CHECKED_IN transition is the atomic gate. */
  private async admit(
    ctx: RequestContext,
    input: {
      ticketId: string;
      eventId: string;
      ticketTypeId: string;
      participantName: string | null;
      currentStatus: TicketStatus;
      operatorMembershipId: string;
      mode: CheckinMode;
      manual: boolean;
      deviceId?: string | undefined;
      checkedInAt: Date;
      justification?: string | undefined;
    },
  ): Promise<CheckinValidation> {
    if (input.currentStatus !== "VALID") {
      return this.rejection(ctx.organizationId, input);
    }

    const transitioned = await this.deps.tickets.updateStatus(
      ctx.organizationId,
      input.ticketId,
      ["VALID"],
      "CHECKED_IN",
    );
    if (!transitioned) {
      // Raced to a non-VALID state between read and write.
      return this.rejection(ctx.organizationId, { ...input, currentStatus: "CHECKED_IN" });
    }

    await this.deps.checkins.create({
      organizationId: ctx.organizationId,
      eventId: input.eventId,
      ticketId: input.ticketId,
      operatorMembershipId: input.operatorMembershipId,
      deviceId: input.deviceId,
      mode: input.mode,
      manual: input.manual,
      justification: input.justification,
      checkedInAt: input.checkedInAt,
    });

    return {
      accepted: true,
      ticket: {
        id: input.ticketId,
        ticketTypeId: input.ticketTypeId,
        participantName: input.participantName,
        status: "CHECKED_IN",
      },
    };
  }

  private async rejection(
    organizationId: string,
    input: { ticketId: string; currentStatus: TicketStatus },
  ): Promise<CheckinValidation> {
    const reason = STATUS_REASON[input.currentStatus] ?? "not_found";
    const result: CheckinValidation = { accepted: false, reason };
    if (reason === "already_checked_in") {
      const existing = await this.deps.checkins.findByTicket(organizationId, input.ticketId);
      if (existing) {
        result.existingCheckin = {
          operatorMembershipId: existing.operatorMembershipId,
          checkedInAt: existing.checkedInAt,
          deviceId: existing.deviceId,
        };
      }
    }
    return result;
  }

  private async requireEventOperator(
    ctx: RequestContext,
    eventId: string,
  ): Promise<MembershipRecord> {
    const membership = await requireActiveRole(
      this.deps.memberships,
      ctx,
      CHECKIN_OPERATOR_ROLES,
    );
    await this.mustFindEvent(ctx.organizationId, eventId);
    // Non-superusers must be explicitly assigned to the event (FR-CIN-002).
    if (CHECKIN_ASSIGNABLE_ROLES.includes(membership.role)) {
      const assignment = await this.deps.assignments.findByEventAndMembership(
        ctx.organizationId,
        eventId,
        membership.id,
      );
      if (!assignment || !assignment.active) throw new NotFoundOrForbiddenError();
    }
    return membership;
  }

  private async mustFindEvent(organizationId: string, eventId: string) {
    const event = await this.deps.events.findByIdScoped(organizationId, eventId);
    if (!event) throw new NotFoundOrForbiddenError();
    return event;
  }

  private async audit(
    ctx: RequestContext,
    action: string,
    resourceType: string,
    resourceId: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action,
      resourceType,
      resourceId,
      after,
      correlationId: ctx.correlationId,
    });
  }
}
