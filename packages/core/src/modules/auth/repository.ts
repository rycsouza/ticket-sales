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
  touch(sessionId: string, lastUsedAt: Date): Promise<void>;
  revoke(sessionId: string, revokedAt: Date): Promise<void>;
  revokeAllForUser(userId: string, revokedAt: Date): Promise<number>;
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

  async touch(sessionId: string, lastUsedAt: Date) {
    await this.prisma.session.update({ where: { id: sessionId }, data: { lastUsedAt } });
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
