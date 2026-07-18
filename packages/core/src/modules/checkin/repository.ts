import type { PrismaClient } from "@ingressos/db";
import type { CheckinAssignmentRecord, CheckinMode, CheckinRecord } from "./types";

export interface CheckinAssignmentRepository {
  upsert(data: {
    organizationId: string;
    eventId: string;
    membershipId: string;
    sectorId?: string | undefined;
  }): Promise<CheckinAssignmentRecord>;
  findByEventAndMembership(
    organizationId: string,
    eventId: string,
    membershipId: string,
  ): Promise<CheckinAssignmentRecord | null>;
  listByEvent(organizationId: string, eventId: string): Promise<CheckinAssignmentRecord[]>;
  setActive(
    organizationId: string,
    eventId: string,
    membershipId: string,
    active: boolean,
  ): Promise<CheckinAssignmentRecord>;
}

export interface CheckinRepository {
  /** Idempotent admission claim: returns null on the unique(ticketId) clash. */
  create(data: {
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
  }): Promise<CheckinRecord | null>;
  findByTicket(organizationId: string, ticketId: string): Promise<CheckinRecord | null>;
  deleteByTicket(organizationId: string, ticketId: string): Promise<boolean>;
  countByEvent(organizationId: string, eventId: string): Promise<number>;
}

const assignmentSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  membershipId: true,
  sectorId: true,
  active: true,
} as const;

const checkinSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  ticketId: true,
  operatorMembershipId: true,
  deviceId: true,
  mode: true,
  manual: true,
  checkedInAt: true,
} as const;

export class PrismaCheckinAssignmentRepository implements CheckinAssignmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(data: {
    organizationId: string;
    eventId: string;
    membershipId: string;
    sectorId?: string | undefined;
  }) {
    return this.prisma.checkinAssignment.upsert({
      where: { eventId_membershipId: { eventId: data.eventId, membershipId: data.membershipId } },
      create: {
        organizationId: data.organizationId,
        eventId: data.eventId,
        membershipId: data.membershipId,
        sectorId: data.sectorId ?? null,
      },
      update: { active: true, sectorId: data.sectorId ?? null },
      select: assignmentSelect,
    });
  }

  async findByEventAndMembership(organizationId: string, eventId: string, membershipId: string) {
    return this.prisma.checkinAssignment.findFirst({
      where: { organizationId, eventId, membershipId },
      select: assignmentSelect,
    });
  }

  async listByEvent(organizationId: string, eventId: string) {
    return this.prisma.checkinAssignment.findMany({
      where: { organizationId, eventId },
      select: assignmentSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async setActive(
    organizationId: string,
    eventId: string,
    membershipId: string,
    active: boolean,
  ) {
    const result = await this.prisma.checkinAssignment.updateMany({
      where: { organizationId, eventId, membershipId },
      data: { active },
    });
    if (result.count === 0) throw new Error("Assignment not found in organization scope");
    const updated = await this.findByEventAndMembership(organizationId, eventId, membershipId);
    if (!updated) throw new Error("Assignment vanished after update");
    return updated;
  }
}

export class PrismaCheckinRepository implements CheckinRepository {
  constructor(private readonly prisma: PrismaClient) {}

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
    try {
      return await this.prisma.checkin.create({
        data: {
          organizationId: data.organizationId,
          eventId: data.eventId,
          ticketId: data.ticketId,
          operatorMembershipId: data.operatorMembershipId,
          deviceId: data.deviceId ?? null,
          mode: data.mode,
          manual: data.manual,
          justification: data.justification ?? null,
          checkedInAt: data.checkedInAt,
          syncedAt: data.syncedAt ?? null,
        },
        select: checkinSelect,
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "P2002"
      ) {
        return null; // unique(ticketId) — already admitted
      }
      throw error;
    }
  }

  async findByTicket(organizationId: string, ticketId: string) {
    return this.prisma.checkin.findFirst({
      where: { organizationId, ticketId },
      select: checkinSelect,
    });
  }

  async deleteByTicket(organizationId: string, ticketId: string): Promise<boolean> {
    const result = await this.prisma.checkin.deleteMany({ where: { organizationId, ticketId } });
    return result.count > 0;
  }

  async countByEvent(organizationId: string, eventId: string) {
    return this.prisma.checkin.count({ where: { organizationId, eventId } });
  }
}
