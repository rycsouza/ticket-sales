import type { CSSProperties } from "react";
import type { PageBlock } from "@ingressos/core";
import { brandTokens } from "@/lib/brand-theme";
import type { PublicEventView } from "@/lib/public-views";
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

/** Maps the (already validated) block document to sections. */
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
            offers={event.offers}
            couponsAvailable={event.couponsAvailable}
            maxTicketsPerOrder={event.maxTicketsPerOrder}
            platformFeeBps={event.platformFeeBps}
            feeMode={event.feeMode}
            eventTerms={event.eventTerms}
            cancellationPolicy={event.cancellationPolicy}
            mpPublicKey={mpPublicKey}
            orgNiche={event.orgNiche}
          />
        </section>
      );
  }
}

/**
 * The full public sales page (theme + blocks + checkout). Shared by the live
 * public route and the staff preview. `preview` shows a banner and disables the
 * marketing-block collapse so operators can inspect every section at once.
 */
export function EventPageView({
  event,
  mpPublicKey,
  preview = false,
}: {
  event: PublicEventView;
  mpPublicKey: string | null;
  preview?: boolean;
}) {
  const themeStyle = brandTokens(event.page.brandColor) as CSSProperties;

  const availablePrices = event.batches.filter((b) => b.available).map((b) => b.priceCents);
  const ticketsBlock = event.page.blocks.find((b) => b.type === "tickets");
  const fromPriceCents = availablePrices.length > 0 ? Math.min(...availablePrices) : null;

  return (
    <CheckoutFlowProvider>
      {preview && (
        <div className="sticky top-0 z-50 bg-brand px-4 py-2 text-center text-small font-medium text-brand-fg">
          Prévia — só você vê. As mudanças entram no ar quando você publicar/salvar.
        </div>
      )}
      <div
        data-theme={event.page.theme}
        // Extra bottom room on mobile clears the fixed action / CTA bar. It lives
        // here (page level), not on the checkout section, so it only pads the true
        // bottom of the page and never opens a gap between blocks (e.g. before a
        // Local block that renders after the checkout on step 1).
        className="relative min-h-svh bg-page text-ink px-3 pt-5 pb-24 sm:px-4 sm:py-8"
      >
        {event.page.backgroundUrl && (
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
            // Hero + tickets stay mounted across steps; other (promotional)
            // blocks collapse once the buyer advances past step 1 — but in
            // preview we keep them all visible for inspection.
            if (preview || block.type === "tickets" || block.type === "hero") {
              return renderBlock(block, event, mpPublicKey);
            }
            return <StepOneOnly key={block.id}>{renderBlock(block, event, mpPublicKey)}</StepOneOnly>;
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
