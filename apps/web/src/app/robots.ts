import type { MetadataRoute } from "next";

const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** robots.txt — index public pages, keep private/staff areas out of crawlers. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/painel", "/entrar", "/pedido", "/t/", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
