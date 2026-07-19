// In-memory fakes for event-page tests — same org-scoping behavior as the
// Prisma repository so tenant-isolation tests are meaningful.

import type { PublicImageStoragePort } from "../ports/image-storage";
import type {
  EventPageRepository,
  EventPageRow,
  UpsertEventPageData,
} from "../modules/event-page/repository";

export class InMemoryEventPageRepository implements EventPageRepository {
  readonly pages: EventPageRow[] = [];

  async findByEvent(organizationId: string, eventId: string): Promise<EventPageRow | null> {
    return (
      this.pages.find((p) => p.eventId === eventId && p.organizationId === organizationId) ??
      null
    );
  }

  async upsert(
    organizationId: string,
    eventId: string,
    data: UpsertEventPageData,
    defaultBlocks: unknown[],
  ): Promise<EventPageRow> {
    const existing = await this.findByEvent(organizationId, eventId);
    if (existing) {
      if (data.brandColor !== undefined) existing.brandColor = data.brandColor;
      if (data.logoUrl !== undefined) existing.logoUrl = data.logoUrl;
      if (data.bannerUrl !== undefined) existing.bannerUrl = data.bannerUrl;
      if (data.faviconUrl !== undefined) existing.faviconUrl = data.faviconUrl;
      if (data.blocks !== undefined) existing.blocks = data.blocks;
      return existing;
    }
    const row: EventPageRow = {
      eventId,
      organizationId,
      brandColor: data.brandColor ?? null,
      logoUrl: data.logoUrl ?? null,
      bannerUrl: data.bannerUrl ?? null,
      faviconUrl: data.faviconUrl ?? null,
      blocks: data.blocks ?? defaultBlocks,
    };
    this.pages.push(row);
    return row;
  }
}

export class FakePublicImageStorage implements PublicImageStoragePort {
  readonly uploads: { folder: string; bytes: number; contentType: string }[] = [];

  async upload(input: {
    folder: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<{ url: string }> {
    this.uploads.push({
      folder: input.folder,
      bytes: input.body.byteLength,
      contentType: input.contentType,
    });
    return { url: `https://res.cloudinary.com/test/${input.folder}/${this.uploads.length}.webp` };
  }
}
