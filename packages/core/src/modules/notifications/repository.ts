import type { PrismaClient } from "@ingressos/db";

export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export interface NotificationRecord {
  id: string;
  organizationId: string | null;
  status: NotificationStatus;
  type: string;
  recipient: string;
  attempts: number;
  orderId: string | null;
}

export interface NotificationRepository {
  create(data: {
    organizationId?: string | undefined;
    type: string;
    recipient: string;
    subject?: string | undefined;
    orderId?: string | undefined;
    ticketId?: string | undefined;
    correlationId: string;
  }): Promise<NotificationRecord>;
  markSent(id: string, providerMessageId: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  /** FAILED notifications eligible for retry (FR-NOT-006). */
  listRetryable(maxAttempts: number, limit: number): Promise<NotificationRecord[]>;
}

const notificationSelect = {
  id: true,
  organizationId: true,
  status: true,
  type: true,
  recipient: true,
  attempts: true,
  orderId: true,
} as const;

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    organizationId?: string | undefined;
    type: string;
    recipient: string;
    subject?: string | undefined;
    orderId?: string | undefined;
    ticketId?: string | undefined;
    correlationId: string;
  }): Promise<NotificationRecord> {
    return this.prisma.notification.create({
      data: {
        organizationId: data.organizationId ?? null,
        type: data.type,
        recipient: data.recipient,
        subject: data.subject ?? null,
        orderId: data.orderId ?? null,
        ticketId: data.ticketId ?? null,
        correlationId: data.correlationId,
      },
      select: notificationSelect,
    });
  }

  async markSent(id: string, providerMessageId: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: {
        status: "SENT",
        providerMessageId,
        sentAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      // Error message only — never the message body (it carries ticket links)
      data: { status: "FAILED", lastError: error.slice(0, 500), attempts: { increment: 1 } },
    });
  }

  async listRetryable(maxAttempts: number, limit: number) {
    return this.prisma.notification.findMany({
      where: { status: "FAILED", attempts: { lt: maxAttempts } },
      select: notificationSelect,
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }
}
