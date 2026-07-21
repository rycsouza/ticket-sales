import type { MetadataRoute } from "next";
import { getServices } from "@/lib/services";

// Read raw (not via loadServerEnv) so it never throws at build.
const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Regenerate at most hourly; never fail the build if the DB is unreachable.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
  ];

  try {
    const events = await getServices().publicEvents.listPublished();
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
