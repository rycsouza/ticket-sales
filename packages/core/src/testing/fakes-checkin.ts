import type {
  CheckinAssignmentRepository,
  CheckinRepository,
} from "../modules/checkin/repository";
import type {
  CheckinAssignmentRecord,
  CheckinMode,
  CheckinRecord,
} from "../modules/checkin/types";
import { nextId } from "./fakes";

export class InMemoryCheckinAssignmentRepository implements CheckinAssignmentRepository {
  readonly assignments: CheckinAssignmentRecord[] = [];

  async upsert(data: {
    organizationId: string;
    eventId: string;
    membershipId: string;
    sectorId?: string | undefined;
  }) {
    const existing = this.assignments.find(
      (a) => a.eventId === data.eventId && a.membershipId === data.membershipId,
    );
    if (existing) {
      existing.active = true;
      existing.sectorId = data.sectorId ?? null;
      return existing;
    }
    const record: CheckinAssignmentRecord = {
      id: nextId("cka"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      membershipId: data.membershipId,
      sectorId: data.sectorId ?? null,
      active: true,
    };
    this.assignments.push(record);
    return record;
  }

  async findByEventAndMembership(organizationId: string, eventId: string, membershipId: string) {
    return (
      this.assignments.find(
        (a) =>
          a.organizationId === organizationId &&
          a.eventId === eventId &&
          a.membershipId === membershipId,
      ) ?? null
    );
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.assignments.filter(
      (a) => a.organizationId === organizationId && a.eventId === eventId,
    );
  }

  async setActive(
    organizationId: string,
    eventId: string,
    membershipId: string,
    active: boolean,
  ) {
    const assignment = await this.findByEventAndMembership(organizationId, eventId, membershipId);
    if (!assignment) throw new Error("Assignment not found in organization scope");
    assignment.active = active;
    return assignment;
  }
}

export class InMemoryCheckinRepository implements CheckinRepository {
  readonly checkins: CheckinRecord[] = [];

  async create(data: {
    organizationId: string;
    eventId: string;
    ticketId: string;
    operatorMembershipId: string;
    deviceId?: string | undefined;
    mode: CheckinMode;
    manual: boolean;
    justification?: string | undefined;
    checkedInAt: Date;
    syncedAt?: Date | undefined;
  }): Promise<CheckinRecord | null> {
    if (this.checkins.some((c) => c.ticketId === data.ticketId)) return null; // unique(ticketId)
    const record: CheckinRecord = {
      id: nextId("chk"),
      organizationId: data.organizationId,
      eventId: data.eventId,
      ticketId: data.ticketId,
      operatorMembershipId: data.operatorMembershipId,
      deviceId: data.deviceId ?? null,
      mode: data.mode,
      manual: data.manual,
      checkedInAt: data.checkedInAt,
    };
    this.checkins.push(record);
    return record;
  }

  async findByTicket(organizationId: string, ticketId: string) {
    return (
      this.checkins.find(
        (c) => c.organizationId === organizationId && c.ticketId === ticketId,
      ) ?? null
    );
  }

  async deleteByTicket(organizationId: string, ticketId: string): Promise<boolean> {
    const index = this.checkins.findIndex(
      (c) => c.organizationId === organizationId && c.ticketId === ticketId,
    );
    if (index < 0) return false;
    this.checkins.splice(index, 1);
    return true;
  }

  async countByEvent(organizationId: string, eventId: string) {
    return this.checkins.filter(
      (c) => c.organizationId === organizationId && c.eventId === eventId,
    ).length;
  }
}
