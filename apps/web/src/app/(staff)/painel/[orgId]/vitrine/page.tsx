import type { Metadata } from "next";
import { dashboardCtx, requireDashboardUser, resolveOrg } from "@/lib/dashboard";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getPlatformServices } from "@/lib/services";
import { parseStoredTrustItems } from "@ingressos/core";
import { PageHeader } from "@/components/ui";
import { StorefrontEditor } from "./storefront-editor";

export const metadata: Metadata = { title: "Minha página" };

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId: orgParam } = await params;
  // Superfície de ADMIN DA PLATAFORMA (allowlist) — usuário comum vê 404.
  await requirePlatformAdmin();
  const { userId } = await requireDashboardUser();
  const org = await resolveOrg(orgParam, userId);
  const ctx = dashboardCtx(org.id, userId);

  const page = await getPlatformServices()
    .storefront.getForOrg(ctx)
    .catch(() => null);

  return (
    <>
      <PageHeader
        title="Minha página"
        description={`Vitrine pública da produtora em /${org.slug} — apresente sua marca e liste sua programação em um link só.`}
      />
      <div className="mt-6 max-w-2xl">
        <StorefrontEditor
          orgId={org.id}
          orgSlug={org.slug}
          niche={org.niche}
          initial={
            page
              ? {
                  enabled: page.enabled,
                  brandColor: page.brandColor ?? "",
                  tagline: page.tagline ?? "",
                  headline: page.headline ?? "",
                  headlineHighlight: page.headlineHighlight ?? "",
                  subheadline: page.subheadline ?? "",
                  heroImageUrl: page.heroImageUrl ?? "",
                  logoUrl: page.logoUrl ?? "",
                  whatsapp: page.whatsapp ?? "",
                  instagram: page.instagram ?? "",
                  seoTitle: page.seoTitle ?? "",
                  seoDescription: page.seoDescription ?? "",
                  footerNote: page.footerNote ?? "",
                  trustItems: parseStoredTrustItems(page.trustItems),
                }
              : null
          }
        />
      </div>
    </>
  );
}
