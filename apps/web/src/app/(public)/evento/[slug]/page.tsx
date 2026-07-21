import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { PageBlock } from "@ingressos/core";
import { brandTokens } from "@/lib/brand-theme";
import { getPublicEventViewBySlug, type PublicEventView } from "@/lib/public-views";
import { CheckoutForm } from "./checkout-form";
import { CheckoutFlowProvider, StepOneOnly } from "./checkout-flow";
import { TicketsCta } from "./tickets-cta";
import { CountdownBlock } from "./blocks/countdown-block";
import { DescriptionBlock } from "./blocks/description-block";
import { FaqBlock } from "./blocks/faq-block";
import { GalleryBlock } from "./blocks/gallery-block";
import { HeroBlock } from "./blocks/hero-block";
import { LineupBlock } from "./blocks/lineup-block";
import { LocationBlock } from "./blocks/location-block";
import { OrganizerBlock } from "./blocks/organizer-block";
import { VideoBlock } from "./blocks/video-block";

// Public event slug: lowercase letters, digits and hyphens.
const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

async function resolveEvent(slug: string): Promise<PublicEventView | null> {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return null;
  return getPublicEventViewBySlug(parsed.data);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await resolveEvent(slug);
  if (!event) return {};

  const description = event.description
    ? event.description.slice(0, 160)
    : `Ingressos para ${event.title}`;

  return {
    title: event.title,
    description,
    ...(event.page.faviconUrl ? { icons: { icon: event.page.faviconUrl } } : {}),
    openGraph: {
      title: event.title,
      description,
      ...(event.page.bannerUrl ? { images: [{ url: event.page.bannerUrl }] } : {}),
    },
  };
}

/** Mapeia o documento de blocos (já validado no server) para as seções. */
function renderBlock(block: PageBlock, event: PublicEventView, mpPublicKey: string | null) {
  if (!block.visible) return null;
  switch (block.type) {
    case "hero":
      return <HeroBlock key={block.id} event={event} config={block.config} />;
    case "description":
      return <DescriptionBlock key={block.id} event={event} config={block.config} />;
    case "location":
      return <LocationBlock key={block.id} event={event} config={block.config} />;
    case "organizer":
      return <OrganizerBlock key={block.id} event={event} config={block.config} />;
    case "faq":
      return <FaqBlock key={block.id} config={block.config} />;
    case "lineup":
      return <LineupBlock key={block.id} config={block.config} />;
    case "gallery":
      return <GalleryBlock key={block.id} config={block.config} />;
    case "video":
      return <VideoBlock key={block.id} config={block.config} />;
    case "countdown":
      return (
        <CountdownBlock
          key={block.id}
          startsAt={event.startsAt ? event.startsAt.toISOString() : null}
          config={block.config}
        />
      );
    case "tickets":
      return (
        <section key={block.id} id={block.id} className="scroll-mt-4">
          {block.config.heading && (
            <h2 className="mb-2 text-small font-semibold uppercase tracking-wide text-ink-muted">
              {block.config.heading}
            </h2>
          )}
          <CheckoutForm
            eventId={event.id}
            batches={event.batches}
            maxTicketsPerOrder={event.maxTicketsPerOrder}
            platformFeeBps={event.platformFeeBps}
            feeMode={event.feeMode}
            eventTerms={event.eventTerms}
            cancellationPolicy={event.cancellationPolicy}
            mpPublicKey={mpPublicKey}
          />
        </section>
      );
  }
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await resolveEvent(slug);
  if (!event) notFound();

  // Cor do produtor re-tematiza a página inteira via tokens --color-brand*
  // (hex inválido → {} → tema padrão). Componentes não mudam nada.
  const themeStyle = brandTokens(event.page.brandColor) as CSSProperties;

  // Public key for the card Brick on the in-flow Pagamento step. Read raw (not
  // via loadServerEnv) so it can't throw at build; absent → Pix only.
  const mpPublicKey = process.env.MERCADOPAGO_PUBLIC_KEY || null;

  // CTA fixo "comprar ingressos": menor preço entre lotes compráveis agora.
  const availablePrices = event.batches.filter((b) => b.available).map((b) => b.priceCents);
  const ticketsBlock = event.page.blocks.find((b) => b.type === "tickets");
  const fromPriceCents = availablePrices.length > 0 ? Math.min(...availablePrices) : null;

  return (
    <CheckoutFlowProvider>
      <div className="relative min-h-dvh px-3 py-5 sm:px-4 sm:py-8">
        {event.page.backgroundUrl && (
          // Full-page background behind the checkout card. A dark scrim keeps
          // the surrounding area calm and the white card readable. URL is
          // Cloudinary-allowlisted on write, so it is safe in an inline style.
          <div
            aria-hidden
            className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.55)), url("${event.page.backgroundUrl}")`,
            }}
          />
        )}
        <main
          className="mx-auto max-w-lg space-y-4 rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-5"
          style={themeStyle}
        >
          {event.page.blocks.map((block) => {
            // The hero (event identity: banner + title + date + venue) and the
            // tickets block (the checkout itself) stay mounted across every step;
            // every other block is promotional and collapses once the buyer
            // advances past step 1.
            if (block.type === "tickets" || block.type === "hero") {
              return renderBlock(block, event, mpPublicKey);
            }
            return (
              <StepOneOnly key={block.id}>{renderBlock(block, event, mpPublicKey)}</StepOneOnly>
            );
          })}
          {ticketsBlock && fromPriceCents !== null && (
            <StepOneOnly>
              <TicketsCta anchorId={ticketsBlock.id} fromPriceCents={fromPriceCents} />
            </StepOneOnly>
          )}
        </main>
      </div>
    </CheckoutFlowProvider>
  );
}
