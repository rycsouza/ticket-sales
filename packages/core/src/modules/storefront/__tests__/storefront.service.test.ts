import { describe, expect, it } from "vitest";
import type { RequestContext } from "../../../shared/context";
import { NotFoundOrForbiddenError } from "../../../shared/errors";
import { InMemoryAuditRepository, InMemoryMembershipRepository } from "../../../testing/fakes";
import type { OrgNiche } from "../../identity/types";
import type {
  OrgLandingPageRecord,
  OrgLandingPageRepository,
  PublicStorefront,
} from "../repository";
import { parseStoredTrustItems, updateOrgLandingPageSchema } from "../schemas";
import { StorefrontService } from "../service";

/** Fake do repo com um "diretório" de orgs (slug→org) injetável. */
class InMemoryOrgLandingPageRepository implements OrgLandingPageRepository {
  readonly pages = new Map<string, OrgLandingPageRecord>();
  constructor(
    private readonly orgs: {
      id: string;
      slug: string;
      name: string;
      niche: OrgNiche;
      status: "ACTIVE" | "SUSPENDED";
    }[],
  ) {}

  async findByOrganizationId(organizationId: string) {
    return this.pages.get(organizationId) ?? null;
  }

  async upsert(
    organizationId: string,
    data: Partial<Omit<OrgLandingPageRecord, "organizationId" | "updatedAt">>,
  ): Promise<OrgLandingPageRecord> {
    const current =
      this.pages.get(organizationId) ??
      ({
        organizationId,
        enabled: false,
        tagline: null,
        headline: null,
        headlineHighlight: null,
        subheadline: null,
        heroImageUrl: null,
        logoUrl: null,
        whatsapp: null,
        instagram: null,
        trustItems: null,
        seoTitle: null,
        seoDescription: null,
        footerNote: null,
        updatedAt: new Date(0),
      } satisfies OrgLandingPageRecord);
    const next = { ...current };
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) (next as Record<string, unknown>)[key] = value;
    }
    this.pages.set(organizationId, next);
    return next;
  }

  async findEnabledByOrgSlug(slug: string): Promise<PublicStorefront | null> {
    const org = this.orgs.find((o) => o.slug === slug);
    if (!org || org.status !== "ACTIVE") return null;
    const page = this.pages.get(org.id);
    if (!page?.enabled) return null;
    return {
      organizationId: org.id,
      orgSlug: org.slug,
      orgName: org.name,
      publicName: null,
      niche: org.niche,
      page,
    };
  }

  async listEnabled() {
    return [...this.pages.values()]
      .filter((p) => p.enabled)
      .map((p) => ({
        orgSlug: this.orgs.find((o) => o.id === p.organizationId)?.slug ?? "?",
        updatedAt: p.updatedAt,
      }));
  }
}

const ORG_A = { id: "org_A", slug: "org-a", name: "Org A", niche: "VIAGENS" as const, status: "ACTIVE" as const };
const ORG_B = { id: "org_B", slug: "org-b", name: "Org B", niche: "EVENTOS" as const, status: "ACTIVE" as const };

function setup() {
  const memberships = new InMemoryMembershipRepository();
  const audit = new InMemoryAuditRepository();
  const pages = new InMemoryOrgLandingPageRepository([ORG_A, ORG_B]);
  const service = new StorefrontService({ pages, memberships, audit });
  return { memberships, audit, pages, service };
}

function ctx(organizationId: string, userId: string, role = "OWNER"): RequestContext {
  return { organizationId, userId, role, correlationId: "corr" };
}

describe("StorefrontService.update", () => {
  it("OWNER updates the page and the change is audited", async () => {
    const env = setup();
    await env.memberships.create({ organizationId: ORG_A.id, userId: "u1", role: "OWNER" });

    const page = await env.service.update(ctx(ORG_A.id, "u1"), {
      enabled: true,
      headline: "Sua próxima viagem começa aqui",
    });

    expect(page.enabled).toBe(true);
    expect(page.headline).toBe("Sua próxima viagem começa aqui");
    expect(env.audit.byAction("storefront.updated")).toHaveLength(1);
  });

  it("blocks roles without management permission", async () => {
    const env = setup();
    await env.memberships.create({ organizationId: ORG_A.id, userId: "u2", role: "SUPPORT" });

    await expect(
      env.service.update(ctx(ORG_A.id, "u2", "SUPPORT"), { enabled: true }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
  });

  it("org B owner cannot write org A's page (tenant isolation)", async () => {
    const env = setup();
    await env.memberships.create({ organizationId: ORG_B.id, userId: "uB", role: "OWNER" });

    await expect(
      env.service.update(ctx(ORG_A.id, "uB"), { enabled: true }),
    ).rejects.toBeInstanceOf(NotFoundOrForbiddenError);
    expect(env.pages.pages.has(ORG_A.id)).toBe(false);
  });
});

describe("StorefrontService.getPublicBySlug", () => {
  it("serves only ENABLED pages; disabled/unknown → null", async () => {
    const env = setup();
    await env.memberships.create({ organizationId: ORG_A.id, userId: "u1", role: "OWNER" });
    await env.service.update(ctx(ORG_A.id, "u1"), { headline: "Oi" }); // ainda desabilitada

    expect(await env.service.getPublicBySlug("org-a")).toBeNull();
    expect(await env.service.getPublicBySlug("nao-existe")).toBeNull();

    await env.service.update(ctx(ORG_A.id, "u1"), { enabled: true });
    const publicPage = await env.service.getPublicBySlug("org-a");
    expect(publicPage?.orgSlug).toBe("org-a");
    expect(publicPage?.niche).toBe("VIAGENS");
  });

  it("re-validates trustItems on read (corrupted JSON → empty list)", async () => {
    const env = setup();
    await env.memberships.create({ organizationId: ORG_A.id, userId: "u1", role: "OWNER" });
    await env.service.update(ctx(ORG_A.id, "u1"), { enabled: true });
    env.pages.pages.get(ORG_A.id)!.trustItems = [{ hacked: true }];

    const publicPage = await env.service.getPublicBySlug("org-a");
    expect(publicPage?.trustItems).toEqual([]);
  });
});

describe("updateOrgLandingPageSchema", () => {
  it("rejects non-Cloudinary image URLs and unknown fields (mass assignment)", () => {
    expect(
      updateOrgLandingPageSchema.safeParse({ heroImageUrl: "https://evil.com/x.png" }).success,
    ).toBe(false);
    expect(
      updateOrgLandingPageSchema.safeParse({ organizationId: "outra-org" }).success,
    ).toBe(false);
    expect(updateOrgLandingPageSchema.safeParse({ whatsapp: "abc" }).success).toBe(false);
    expect(
      updateOrgLandingPageSchema.safeParse({
        heroImageUrl: "https://res.cloudinary.com/x/image/upload/a.webp",
        whatsapp: "5567992949342",
        trustItems: [{ icon: "shield", title: "Segurança", description: "Sempre" }],
      }).success,
    ).toBe(true);
  });

  it("parseStoredTrustItems tolerates garbage", () => {
    expect(parseStoredTrustItems("not-an-array")).toEqual([]);
    expect(parseStoredTrustItems(null)).toEqual([]);
    expect(
      parseStoredTrustItems([{ icon: "star", title: "A", description: "B" }]),
    ).toHaveLength(1);
  });
});
