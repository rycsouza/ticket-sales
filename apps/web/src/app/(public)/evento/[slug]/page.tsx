import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatEventDate, getPublicEventViewBySlug, type PublicEventView } from "@/lib/public-views";
import { EventPageView } from "./event-page-view";

// Public event slug: lowercase letters, digits and hyphens.
const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

async function resolveEvent(slug: string): Promise<PublicEventView | null> {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return null;
  return getPublicEventViewBySlug(parsed.data);
}

/**
 * Turn a Cloudinary banner into a 1200×630 social card (the size WhatsApp /
 * Facebook / X expect). Non-Cloudinary URLs are used as-is.
 */
function socialImageUrl(url: string): string {
  if (url.includes("res.cloudinary.com") && url.includes("/image/upload/")) {
    return url.replace("/image/upload/", "/image/upload/c_fill,g_auto,w_1200,h_630,q_auto,f_jpg/");
  }
  return url;
}

function buildDescription(event: PublicEventView): string {
  if (event.description) {
    const clean = event.description.replace(/\s+/g, " ").trim();
    return clean.length > 200 ? `${clean.slice(0, 197)}…` : clean;
  }
  const date = event.startsAt ? formatEventDate(event.startsAt, event.timezone) : null;
  const place = [event.venueName, event.city].filter(Boolean).join(" · ");
  return ["Garanta seu ingresso.", date, place].filter(Boolean).join(" · ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await resolveEvent(slug);
  if (!event) return {};

  const description = buildDescription(event);
  const canonical = `/evento/${slug}`;
  const banner = event.page.bannerUrl ?? event.page.logoUrl;
  const images = banner
    ? [{ url: socialImageUrl(banner), width: 1200, height: 630, alt: event.title }]
    : undefined;

  return {
    title: event.title,
    description,
    alternates: { canonical },
    ...(event.page.faviconUrl ? { icons: { icon: event.page.faviconUrl } } : {}),
    openGraph: {
      type: "website",
      siteName: "Ingressos",
      locale: "pt_BR",
      url: canonical,
      title: event.title,
      description,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: event.title,
      description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await resolveEvent(slug);
  if (!event) notFound();

  // Public key for the card Brick on the in-flow Pagamento step. Read raw (not
  // via loadServerEnv) so it can't throw at build; absent → Pix only.
  const mpPublicKey = process.env.MERCADOPAGO_PUBLIC_KEY || null;

  return <EventPageView event={event} mpPublicKey={mpPublicKey} />;
}
