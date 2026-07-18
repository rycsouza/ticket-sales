import type { PrismaClient } from "@ingressos/db";

/**
 * Audit trail (EP-12). Append-only: this repository exposes no update or
 * delete on purpose (FR-AUD-004). Callers must redact sensitive values from
 * before/after snapshots (FR-AUD-003) — never pass passwords, tokens or full
 * card/QR data here.
 */
export interface AuditEntry {
  organizationId?: string | undefined;
  actorUserId?: string | undefined;
  /** "user" (default) | "system" | "platform_admin" */
  actorType?: string | undefined;
  action: string;
  resourceType: string;
  resourceId?: string | undefined;
  justification?: string | undefined;
  before?: unknown;
  after?: unknown;
  correlationId: string;
  ip?: string | undefined;
}

export interface AuditRepository {
  append(entry: AuditEntry): Promise<void>;
}

/** Read side of the trail — status/history views (FR-TKT-011, FR-ADM-002). */
export interface AuditReadRecord {
  id: string;
  action: string;
  actorUserId: string | null;
  actorType: string;
  resourceType: string;
  resourceId: string | null;
  justification: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
}

export interface AuditReader {
  listByResource(
    organizationId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<AuditReadRecord[]>;
  /** Trail for several resources at once (e.g. an order plus its tickets). */
  listByResources(
    organizationId: string,
    refs: { resourceType: string; resourceId: string }[],
  ): Promise<AuditReadRecord[]>;
}

const auditReadSelect = {
  id: true,
  action: true,
  actorUserId: true,
  actorType: true,
  resourceType: true,
  resourceId: true,
  justification: true,
  before: true,
  after: true,
  createdAt: true,
} as const;

export class PrismaAuditRepository implements AuditRepository, AuditReader {
  constructor(private readonly prisma: PrismaClient) {}

  async listByResource(organizationId: string, resourceType: string, resourceId: string) {
    return this.prisma.auditEvent.findMany({
      where: { organizationId, resourceType, resourceId },
      select: auditReadSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async listByResources(
    organizationId: string,
    refs: { resourceType: string; resourceId: string }[],
  ) {
    if (refs.length === 0) return [];
    return this.prisma.auditEvent.findMany({
      where: {
        organizationId,
        OR: refs.map((ref) => ({
          resourceType: ref.resourceType,
          resourceId: ref.resourceId,
        })),
      },
      select: auditReadSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  async append(entry: AuditEntry): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        organizationId: entry.organizationId ?? null,
        actorUserId: entry.actorUserId ?? null,
        actorType: entry.actorType ?? "user",
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        justification: entry.justification ?? null,
        correlationId: entry.correlationId,
        ip: entry.ip ?? null,
        ...(entry.before !== undefined ? { before: entry.before as object } : {}),
        ...(entry.after !== undefined ? { after: entry.after as object } : {}),
      },
    });
  }
}
