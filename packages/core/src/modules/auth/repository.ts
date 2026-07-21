import type { PrismaClient } from "@ingressos/db";

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface SessionRepository {
  create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip?: string | undefined;
    userAgent?: string | undefined;
  }): Promise<SessionRecord>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  /** Updates lastUsedAt; extends expiresAt too when `expiresAt` is given (sliding window). */
  touch(sessionId: string, lastUsedAt: Date, expiresAt?: Date): Promise<void>;
  revoke(sessionId: string, revokedAt: Date): Promise<void>;
  revokeAllForUser(userId: string, revokedAt: Date): Promise<number>;
}

export interface TrustedDeviceRepository {
  create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    label?: string | undefined;
  }): Promise<void>;
  /** Valid = matches user, not expired. */
  isValid(userId: string, tokenHash: string, now: Date): Promise<boolean>;
}

export class PrismaTrustedDeviceRepository implements TrustedDeviceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    label?: string | undefined;
  }) {
    await this.prisma.trustedDevice.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        label: data.label ?? null,
      },
    });
  }

  async isValid(userId: string, tokenHash: string, now: Date): Promise<boolean> {
    const device = await this.prisma.trustedDevice.findUnique({
      where: { tokenHash },
      select: { userId: true, expiresAt: true },
    });
    return !!device && device.userId === userId && device.expiresAt.getTime() > now.getTime();
  }
}

const sessionSelect = {
  id: true,
  userId: true,
  tokenHash: true,
  expiresAt: true,
  revokedAt: true,
} as const;

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip?: string | undefined;
    userAgent?: string | undefined;
  }) {
    return this.prisma.session.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        ip: data.ip ?? null,
        userAgent: data.userAgent ?? null,
      },
      select: sessionSelect,
    });
  }

  async findByTokenHash(tokenHash: string) {
    return this.prisma.session.findUnique({ where: { tokenHash }, select: sessionSelect });
  }

  async touch(sessionId: string, lastUsedAt: Date, expiresAt?: Date) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: expiresAt ? { lastUsedAt, expiresAt } : { lastUsedAt },
    });
  }

  async revoke(sessionId: string, revokedAt: Date) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt },
    });
  }

  async revokeAllForUser(userId: string, revokedAt: Date) {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });
    return result.count;
  }
}
