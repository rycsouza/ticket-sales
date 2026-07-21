import type { RequestContext } from "../../shared/context";
import {
  ConflictError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../shared/errors";
import type { PublicImageStoragePort } from "../../ports/image-storage";
import type { AuditRepository } from "../audit/repository";
import { requireActiveRole, type MembershipLookup } from "../identity/authorization";
import { EVENT_MANAGER_ROLES, EVENT_TERMINAL_STATES, type EventRecord } from "../events/types";
import type { EventPageRepository, EventPageRow } from "./repository";
import {
  defaultPageBlocks,
  eventPageBlocksSchema,
  type PageBlock,
  type UpdateEventPageInput,
} from "./schemas";
import type { EventPageImageKind, EventPageRecord } from "./types";

/** Read-only view of event data the event-page module needs. */
export interface EventReader {
  findByIdScoped(organizationId: string, eventId: string): Promise<EventRecord | null>;
}

export interface EventPageServiceDeps {
  pages: EventPageRepository;
  events: EventReader;
  memberships: MembershipLookup;
  audit: AuditRepository;
  images: PublicImageStoragePort;
}

// Limites de upload por tipo de imagem. SVG/ICO ficam de fora de propósito
// (SVG é vetor de XSS); Cloudinary re-encoda o restante.
const IMAGE_LIMITS: Record<EventPageImageKind, { maxBytes: number }> = {
  banner: { maxBytes: 5 * 1024 * 1024 },
  logo: { maxBytes: 1 * 1024 * 1024 },
  favicon: { maxBytes: 1 * 1024 * 1024 },
  gallery: { maxBytes: 5 * 1024 * 1024 },
  background: { maxBytes: 5 * 1024 * 1024 },
};

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class EventPageService {
  constructor(private readonly deps: EventPageServiceDeps) {}

  /** Config da página do evento — defaults quando nunca foi personalizada. */
  async getPage(ctx: RequestContext, eventId: string): Promise<EventPageRecord> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    const event = await this.mustFindEvent(ctx, eventId);

    const row = await this.deps.pages.findByEvent(ctx.organizationId, eventId);
    if (!row) {
      return {
        eventId: event.id,
        organizationId: ctx.organizationId,
        brandColor: null,
        logoUrl: null,
        bannerUrl: null,
        faviconUrl: null,
        backgroundUrl: null,
        blocks: defaultPageBlocks(),
      };
    }
    return toRecord(row);
  }

  /** Salva identidade visual e/ou blocos; aplica imediatamente (sem draft no MVP). */
  async updatePage(
    ctx: RequestContext,
    eventId: string,
    input: UpdateEventPageInput,
  ): Promise<EventPageRecord> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    const event = await this.mustFindEvent(ctx, eventId);
    if (EVENT_TERMINAL_STATES.includes(event.status)) {
      throw new ConflictError(`Event in status ${event.status} can no longer be edited`);
    }

    const changedKeys = Object.keys(input) as (keyof UpdateEventPageInput)[];
    if (changedKeys.length === 0) return this.getPage(ctx, eventId);

    // Capture BEFORE the update — the audit trail must show the old values
    const previous = await this.deps.pages.findByEvent(ctx.organizationId, eventId);
    const before = previous ? pickRecord(toRecord(previous), changedKeys) : null;

    const row = await this.deps.pages.upsert(
      ctx.organizationId,
      eventId,
      input,
      defaultPageBlocks(),
    );
    const record = toRecord(row);

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "event.page_updated",
      resourceType: "event",
      resourceId: eventId,
      before: before ?? undefined,
      after: pickRecord(record, changedKeys),
      correlationId: ctx.correlationId,
    });

    return record;
  }

  /**
   * Upload de logo/banner/favicon. A pasta é derivada do contexto autenticado
   * — nunca do cliente. Devolve a URL do CDN para o editor salvar via updatePage.
   */
  async uploadImage(
    ctx: RequestContext,
    eventId: string,
    kind: EventPageImageKind,
    body: Uint8Array,
    contentType: string,
  ): Promise<{ url: string }> {
    await requireActiveRole(this.deps.memberships, ctx, EVENT_MANAGER_ROLES);
    const event = await this.mustFindEvent(ctx, eventId);
    if (EVENT_TERMINAL_STATES.includes(event.status)) {
      throw new ConflictError(`Event in status ${event.status} can no longer be edited`);
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new ValidationFailedError("Formato de imagem não suportado (use JPEG, PNG ou WebP)");
    }
    const limit = IMAGE_LIMITS[kind];
    if (body.byteLength === 0) {
      throw new ValidationFailedError("Arquivo de imagem vazio");
    }
    if (body.byteLength > limit.maxBytes) {
      const maxMb = Math.round(limit.maxBytes / (1024 * 1024));
      throw new ValidationFailedError(`Imagem excede o limite de ${maxMb} MB`);
    }

    const { url } = await this.deps.images.upload({
      folder: `orgs/${ctx.organizationId}/events/${eventId}/page`,
      body,
      contentType,
    });

    await this.deps.audit.append({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "event.page_image_uploaded",
      resourceType: "event",
      resourceId: eventId,
      after: { kind, url, bytes: body.byteLength },
      correlationId: ctx.correlationId,
    });

    return { url };
  }

  private async mustFindEvent(ctx: RequestContext, eventId: string): Promise<EventRecord> {
    const event = await this.deps.events.findByIdScoped(ctx.organizationId, eventId);
    if (!event) throw new NotFoundOrForbiddenError();
    return event;
  }
}

/**
 * Leitura defensiva dos blocos persistidos: JSON corrompido/antigo nunca
 * derruba a página — cai para os defaults (e o editor mostra o estado real).
 */
export function parseStoredBlocks(stored: unknown): PageBlock[] {
  const parsed = eventPageBlocksSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  return defaultPageBlocks();
}

function toRecord(row: EventPageRow): EventPageRecord {
  return {
    eventId: row.eventId,
    organizationId: row.organizationId,
    brandColor: row.brandColor,
    logoUrl: row.logoUrl,
    bannerUrl: row.bannerUrl,
    faviconUrl: row.faviconUrl,
    backgroundUrl: row.backgroundUrl,
    blocks: parseStoredBlocks(row.blocks),
  };
}

function pickRecord(
  record: EventPageRecord,
  keys: readonly (keyof UpdateEventPageInput)[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = record[key];
  return out;
}
