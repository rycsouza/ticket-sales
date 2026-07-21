import { describe, expect, it } from "vitest";
import type { RequestContext } from "../../../shared/context";
import {
  ConflictError,
  NotFoundOrForbiddenError,
  ValidationFailedError,
} from "../../../shared/errors";
import { InMemoryAuditRepository, InMemoryMembershipRepository } from "../../../testing/fakes";
import { InMemoryEventRepository } from "../../../testing/fakes-events";
import {
  FakePublicImageStorage,
  InMemoryEventPageRepository,
} from "../../../testing/fakes-event-page";
import { defaultPageBlocks, updateEventPageSchema } from "../schemas";
import { EventPageService, parseStoredBlocks } from "../service";

function setup() {
  const audit = new InMemoryAuditRepository();
  const memberships = new InMemoryMembershipRepository();
  const events = new InMemoryEventRepository();
  const pages = new InMemoryEventPageRepository();
  const images = new FakePublicImageStorage();
  const service = new EventPageService({ pages, events, memberships, audit, images });
  return { audit, memberships, events, pages, images, service };
}

const ORG = "org_A";
const OTHER_ORG = "org_B";
const USER = "user_manager";

function ctx(role = "EVENT_MANAGER", organizationId = ORG, userId = USER): RequestContext {
  return { organizationId, userId, role, correlationId: "corr" };
}

async function withManager(env: ReturnType<typeof setup>, role = "EVENT_MANAGER") {
  await env.memberships.create({
    organizationId: ORG,
    userId: USER,
    role: role as never,
  });
}

async function withEvent(env: ReturnType<typeof setup>, organizationId = ORG) {
  return env.events.create({
    organizationId,
    title: "Festa Junina",
    slug: `festa-${organizationId}`,
    timezone: "America/Sao_Paulo",
  });
}

const CDN = "https://res.cloudinary.com/demo/image/upload/v1/orgs/a/banner.webp";

describe("getPage", () => {
  it("returns defaults when the event was never customized", async () => {
    const env = setup();
    await withManager(env);
    const event = await withEvent(env);

    const page = await env.service.getPage(ctx(), event.id);

    expect(page.brandColor).toBeNull();
    expect(page.blocks).toEqual(defaultPageBlocks());
    expect(page.blocks.some((b) => b.type === "tickets")).toBe(true);
  });

  it("blocks roles outside OWNER/ADMIN/EVENT_MANAGER", async () => {
    const env = setup();
    await env.memberships.create({ organizationId: ORG, userId: USER, role: "FINANCE" });
    const event = await withEvent(env);

    await expect(env.service.getPage(ctx("FINANCE"), event.id)).rejects.toThrow(
      NotFoundOrForbiddenError,
    );
  });

  it("does not leak events from another organization", async () => {
    const env = setup();
    await withManager(env);
    const foreign = await withEvent(env, OTHER_ORG);

    await expect(env.service.getPage(ctx(), foreign.id)).rejects.toThrow(
      NotFoundOrForbiddenError,
    );
  });

  it("falls back to defaults when stored blocks are corrupt", async () => {
    const env = setup();
    await withManager(env);
    const event = await withEvent(env);
    env.pages.pages.push({
      eventId: event.id,
      organizationId: ORG,
      brandColor: "#16a34a",
      logoUrl: null,
      bannerUrl: null,
      faviconUrl: null,
      backgroundUrl: null,
      blocks: { totally: "broken" },
    });

    const page = await env.service.getPage(ctx(), event.id);

    expect(page.brandColor).toBe("#16a34a");
    expect(page.blocks).toEqual(defaultPageBlocks());
  });
});

describe("updatePage", () => {
  it("saves brand color and blocks, auditing before/after", async () => {
    const env = setup();
    await withManager(env);
    const event = await withEvent(env);

    const input = updateEventPageSchema.parse({
      brandColor: "#16A34A",
      blocks: [
        { id: "hero", type: "hero", visible: true, config: {} },
        { id: "tickets", type: "tickets", visible: true, config: { heading: "Garanta o seu" } },
      ],
    });
    const page = await env.service.updatePage(ctx(), event.id, input);

    expect(page.brandColor).toBe("#16a34a"); // normalizado para minúsculas
    expect(page.blocks).toHaveLength(2);
    const entries = env.audit.byAction("event.page_updated");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.after).toMatchObject({ brandColor: "#16a34a" });
  });

  it("rejects updates on events from another organization", async () => {
    const env = setup();
    await withManager(env);
    const foreign = await withEvent(env, OTHER_ORG);

    await expect(
      env.service.updatePage(ctx(), foreign.id, { brandColor: "#16a34a" }),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });

  it("rejects edits on terminal events", async () => {
    const env = setup();
    await withManager(env);
    const event = await withEvent(env);
    await env.events.updateStatus(ORG, event.id, "CANCELLED");

    await expect(
      env.service.updatePage(ctx(), event.id, { brandColor: "#16a34a" }),
    ).rejects.toThrow(ConflictError);
  });

  it("returns current page unchanged for an empty patch", async () => {
    const env = setup();
    await withManager(env);
    const event = await withEvent(env);

    const page = await env.service.updatePage(ctx(), event.id, {});

    expect(page.blocks).toEqual(defaultPageBlocks());
    expect(env.audit.byAction("event.page_updated")).toHaveLength(0);
  });
});

describe("updateEventPageSchema", () => {
  const validBlocks = [
    { id: "hero", type: "hero", visible: true, config: {} },
    { id: "tickets", type: "tickets", visible: true, config: {} },
  ];

  it("rejects unknown keys (strict)", () => {
    expect(
      updateEventPageSchema.safeParse({ brandColor: "#16a34a", organizationId: "evil" }).success,
    ).toBe(false);
  });

  it("rejects invalid hex colors", () => {
    for (const bad of ["16a34a", "#16a34", "#16a34azz", "red", "#fff"]) {
      expect(updateEventPageSchema.safeParse({ brandColor: bad }).success).toBe(false);
    }
  });

  it("rejects image URLs outside our CDN", () => {
    expect(
      updateEventPageSchema.safeParse({ bannerUrl: "https://evil.example.com/x.png" }).success,
    ).toBe(false);
    expect(updateEventPageSchema.safeParse({ bannerUrl: CDN }).success).toBe(true);
  });

  it("requires exactly one tickets block", () => {
    expect(
      updateEventPageSchema.safeParse({
        blocks: [{ id: "hero", type: "hero", visible: true, config: {} }],
      }).success,
    ).toBe(false);
    expect(
      updateEventPageSchema.safeParse({
        blocks: [...validBlocks, { id: "tickets-2", type: "tickets", visible: true, config: {} }],
      }).success,
    ).toBe(false);
    expect(updateEventPageSchema.safeParse({ blocks: validBlocks }).success).toBe(true);
  });

  it("rejects a hidden tickets block", () => {
    expect(
      updateEventPageSchema.safeParse({
        blocks: [
          { id: "hero", type: "hero", visible: true, config: {} },
          { id: "tickets", type: "tickets", visible: false, config: {} },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown block types and duplicate ids", () => {
    expect(
      updateEventPageSchema.safeParse({
        blocks: [...validBlocks, { id: "x", type: "html", visible: true, config: {} }],
      }).success,
    ).toBe(false);
    expect(
      updateEventPageSchema.safeParse({
        blocks: [
          ...validBlocks,
          { id: "hero", type: "description", visible: true, config: { text: null } },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts the new content blocks (faq, lineup, gallery, video, countdown)", () => {
    expect(
      updateEventPageSchema.safeParse({
        blocks: [
          ...validBlocks,
          {
            id: "faq",
            type: "faq",
            visible: true,
            config: { items: [{ question: "Tem meia?", answer: "Sim, com documento." }] },
          },
          {
            id: "lineup",
            type: "lineup",
            visible: true,
            config: { items: [{ name: "DJ Alok", time: "23h" }, { name: "Banda X" }] },
          },
          { id: "gallery", type: "gallery", visible: true, config: { images: [CDN] } },
          {
            id: "video",
            type: "video",
            visible: true,
            config: { youtubeId: "dQw4w9WgXcQ" },
          },
          { id: "countdown", type: "countdown", visible: true, config: {} },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects invalid content in the new blocks", () => {
    // FAQ sem itens
    expect(
      updateEventPageSchema.safeParse({
        blocks: [...validBlocks, { id: "faq", type: "faq", visible: true, config: { items: [] } }],
      }).success,
    ).toBe(false);
    // Galeria com URL externa
    expect(
      updateEventPageSchema.safeParse({
        blocks: [
          ...validBlocks,
          {
            id: "gallery",
            type: "gallery",
            visible: true,
            config: { images: ["https://evil.com/x.png"] },
          },
        ],
      }).success,
    ).toBe(false);
    // Vídeo com URL em vez de ID (bloqueia embed arbitrário)
    expect(
      updateEventPageSchema.safeParse({
        blocks: [
          ...validBlocks,
          {
            id: "video",
            type: "video",
            visible: true,
            config: { youtubeId: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
          },
        ],
      }).success,
    ).toBe(false);
    // Instagram com handle inválido e whatsapp com máscara
    expect(
      updateEventPageSchema.safeParse({
        blocks: [
          validBlocks[0],
          validBlocks[1],
          {
            id: "org",
            type: "organizer",
            visible: true,
            config: { showLogo: true, instagram: "@user with spaces" },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      updateEventPageSchema.safeParse({
        blocks: [
          validBlocks[0],
          validBlocks[1],
          {
            id: "org",
            type: "organizer",
            visible: true,
            config: { showLogo: true, whatsapp: "(11) 99999-8888" },
          },
        ],
      }).success,
    ).toBe(false);
    // Website http (não https)
    expect(
      updateEventPageSchema.safeParse({
        blocks: [
          validBlocks[0],
          validBlocks[1],
          {
            id: "org",
            type: "organizer",
            visible: true,
            config: { showLogo: true, website: "http://insecure.com" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 20 blocks", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `d-${i}`,
      type: "description",
      visible: true,
      config: { text: null },
    }));
    expect(
      updateEventPageSchema.safeParse({ blocks: [...many, validBlocks[1]] }).success,
    ).toBe(false);
  });
});

describe("parseStoredBlocks", () => {
  it("accepts valid stored blocks and falls back on garbage", () => {
    expect(parseStoredBlocks(defaultPageBlocks())).toEqual(defaultPageBlocks());
    expect(parseStoredBlocks(null)).toEqual(defaultPageBlocks());
    expect(parseStoredBlocks([{ type: "tickets" }])).toEqual(defaultPageBlocks());
    expect(parseStoredBlocks("[]")).toEqual(defaultPageBlocks());
  });
});

describe("uploadImage", () => {
  const bytes = (n: number) => new Uint8Array(n).fill(1);

  it("uploads within limits to an org/event-scoped folder and audits", async () => {
    const env = setup();
    await withManager(env);
    const event = await withEvent(env);

    const { url } = await env.service.uploadImage(
      ctx(),
      event.id,
      "logo",
      bytes(1024),
      "image/png",
    );

    expect(url).toContain("res.cloudinary.com");
    expect(env.images.uploads[0]?.folder).toBe(`orgs/${ORG}/events/${event.id}/page`);
    expect(env.audit.byAction("event.page_image_uploaded")).toHaveLength(1);
  });

  it("rejects unsupported content types (SVG included)", async () => {
    const env = setup();
    await withManager(env);
    const event = await withEvent(env);

    await expect(
      env.service.uploadImage(ctx(), event.id, "logo", bytes(10), "image/svg+xml"),
    ).rejects.toThrow(ValidationFailedError);
  });

  it("rejects oversized and empty files", async () => {
    const env = setup();
    await withManager(env);
    const event = await withEvent(env);

    await expect(
      env.service.uploadImage(ctx(), event.id, "logo", bytes(1024 * 1024 + 1), "image/png"),
    ).rejects.toThrow(ValidationFailedError);
    await expect(
      env.service.uploadImage(ctx(), event.id, "banner", bytes(0), "image/png"),
    ).rejects.toThrow(ValidationFailedError);
  });

  it("rejects uploads for events of another organization", async () => {
    const env = setup();
    await withManager(env);
    const foreign = await withEvent(env, OTHER_ORG);

    await expect(
      env.service.uploadImage(ctx(), foreign.id, "logo", bytes(10), "image/png"),
    ).rejects.toThrow(NotFoundOrForbiddenError);
  });
});
