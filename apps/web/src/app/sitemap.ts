import type { MetadataRoute } from "next";
import { getPlatformServices, getTenantServices } from "@/lib/services";

// Read raw (not via loadServerEnv) so it never throws at build.
const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Regenerate at most hourly; never fail the build if the DB is unreachable.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    // Vitrines de produtora (LPs artesanais com rota própria).
    { url: `${base}/jovitur`, changeFrequency: "daily", priority: 0.9 },
  ];

  try {
    // Fan-out por tenant (docs/MULTITENANT.md); dedupe por slug cobre os
    // tenants legados que ainda compartilham um banco físico.
    const seen = new Set<string>();
    const events: Awaited<ReturnType<Awaited<ReturnType<typeof getTenantServices>>["publicEvents"]["listPublished"]>> = [];
    for (const tenant of await getPlatformServices().tenants.listActive()) {
      const services = await getTenantServices(tenant.id).catch(() => null);
      if (!services) continue;
      for (const event of await services.publicEvents.listPublished()) {
        if (seen.has(event.slug)) continue;
        seen.add(event.slug);
        events.push(event);
      }
    }
    for (const event of events) {
      entries.push({
        url: `${base}/evento/${event.slug}`,
        lastModified: event.updatedAt,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch {
    // DB unavailable (e.g. at build) — serve at least the home URL.
  }

  return entries;
}
