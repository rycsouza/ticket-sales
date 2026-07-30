// Vitrine da produtora vive no PLANO DE CONTROLE (platform DB): é resolvida
// pelo slug da org antes de conhecer o banco do tenant.
import type { PlatformPrismaClient } from "@ingressos/db";
import type { OrgNiche } from "../identity/types";

export interface OrgLandingPageRecord {
  organizationId: string;
  enabled: boolean;
  brandColor: string | null;
  tagline: string | null;
  headline: string | null;
  headlineHighlight: string | null;
  subheadline: string | null;
  heroImageUrl: string | null;
  logoUrl: string | null;
  whatsapp: string | null;
  instagram: string | null;
  trustItems: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  footerNote: string | null;
  updatedAt: Date;
}

/** Página + identidade pública da org dona — shape do render público. */
export interface PublicStorefront {
  organizationId: string;
  orgSlug: string;
  orgName: string;
  publicName: string | null;
  niche: OrgNiche;
  page: OrgLandingPageRecord;
}

export interface OrgLandingPageRepository {
  findByOrganizationId(organizationId: string): Promise<OrgLandingPageRecord | null>;
  upsert(
    organizationId: string,
    data: {
      [K in keyof Omit<OrgLandingPageRecord, "organizationId" | "updatedAt">]?:
        | OrgLandingPageRecord[K]
        | undefined;
    },
  ): Promise<OrgLandingPageRecord>;
  /** Public resolution: only ENABLED pages of ACTIVE orgs; unknown → null. */
  findEnabledByOrgSlug(slug: string): Promise<PublicStorefront | null>;
  /** Enabled pages for the sitemap (slug + freshness only). */
  listEnabled(): Promise<{ orgSlug: string; updatedAt: Date }[]>;
}

const pageSelect = {
  organizationId: true,
  enabled: true,
  brandColor: true,
  tagline: true,
  headline: true,
  headlineHighlight: true,
  subheadline: true,
  heroImageUrl: true,
  logoUrl: true,
  whatsapp: true,
  instagram: true,
  trustItems: true,
  seoTitle: true,
  seoDescription: true,
  footerNote: true,
  updatedAt: true,
} as const;

export class PrismaOrgLandingPageRepository implements OrgLandingPageRepository {
  constructor(private readonly prisma: PlatformPrismaClient) {}

  async findByOrganizationId(organizationId: string): Promise<OrgLandingPageRecord | null> {
    return this.prisma.orgLandingPage.findUnique({
      where: { organizationId },
      select: pageSelect,
    });
  }

  async upsert(
    organizationId: string,
    data: {
      [K in keyof Omit<OrgLandingPageRecord, "organizationId" | "updatedAt">]?:
        | OrgLandingPageRecord[K]
        | undefined;
    },
  ): Promise<OrgLandingPageRecord> {
    // Prisma Json columns: null literal precisa do sentinel DbNull.
    const normalized = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    return this.prisma.orgLandingPage.upsert({
      where: { organizationId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: { organizationId, ...(normalized as any) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: normalized as any,
      select: pageSelect,
    });
  }

  async findEnabledByOrgSlug(slug: string): Promise<PublicStorefront | null> {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        publicName: true,
        niche: true,
        status: true,
        landingPage: { select: pageSelect },
      },
    });
    if (!org || org.status !== "ACTIVE" || !org.landingPage?.enabled) return null;
    return {
      organizationId: org.id,
      orgSlug: org.slug,
      orgName: org.name,
      publicName: org.publicName,
      niche: org.niche,
      page: org.landingPage,
    };
  }

  async listEnabled(): Promise<{ orgSlug: string; updatedAt: Date }[]> {
    const pages = await this.prisma.orgLandingPage.findMany({
      where: { enabled: true, organization: { status: "ACTIVE" } },
      select: { updatedAt: true, organization: { select: { slug: true } } },
    });
    return pages.map((p) => ({ orgSlug: p.organization.slug, updatedAt: p.updatedAt }));
  }
}
