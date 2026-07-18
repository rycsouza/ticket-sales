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

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

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
