import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Playfair_Display } from "next/font/google";
import {
  AtSign,
  Bus,
  Heart,
  Map,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { TrustItem } from "@ingressos/core";
import { storefrontAccentTokens } from "@/lib/brand-theme";
import { getPlatformServices } from "@/lib/services";
import { getPublicEventViewsByOrganization, type PublicEventView } from "@/lib/public-views";
import { orgVocab, publicEventPath, type OrgVocab } from "@/lib/org-vocab";
import { ShowcaseGrid, type ShowcaseCardData, type ShowcaseKind } from "./showcase-grid";

/**
 * Vitrine pública por produtora (/<org-slug>) — conteúdo vem do OrgLandingPage
 * (platform DB, editado no painel em "Minha página"); os eventos vêm do banco
 * do tenant. Só páginas HABILITADAS são servidas; o resto → 404 genérico.
 */

// Fonte de exibição da vitrine — cara editorial, distinta do produto (Inter).
const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
  variable: "--font-storefront-display",
});

const BASE_URL = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// ISR: sem isto a página congela no build (evento novo nunca entra,
// viagem encerrada nunca sai).
export const revalidate = 300;

const TRUST_ICONS: Record<TrustItem["icon"], LucideIcon> = {
  shield: ShieldCheck,
  users: Users,
  sparkles: Sparkles,
  bus: Bus,
  map: Map,
  star: Star,
  heart: Heart,
  ticket: Ticket,
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;

async function loadStorefront(orgSlug: string) {
  if (!SLUG_RE.test(orgSlug)) return null;
  return getPlatformServices().storefront.getPublicBySlug(orgSlug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const storefront = await loadStorefront(orgSlug);
  if (!storefront) return {};
  const { page } = storefront;
  const title = page.seoTitle ?? storefront.publicName ?? storefront.orgName;
  const description = page.seoDescription ?? page.subheadline ?? page.tagline ?? "";
  const url = `${BASE_URL}/${storefront.orgSlug}`;
  return {
    title,
    description,
    // Favicon = logo da org (mesmo comportamento do painel); sem logo → padrão.
    ...(page.logoUrl ? { icons: { icon: page.logoUrl } } : {}),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: storefront.publicName ?? storefront.orgName,
      locale: "pt_BR",
      type: "website",
      ...(page.heroImageUrl
        ? { images: [{ url: page.heroImageUrl, width: 1200, height: 630 }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(page.heroImageUrl ? { images: [page.heroImageUrl] } : {}),
    },
  };
}

const TRIP_TZ = "America/Sao_Paulo";

function tripDayOf(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TRIP_TZ }).format(d);
}

/** VIAGENS: rótulo do folheto no título > fallback por dia-calendário. */
function tripKindOf(view: PublicEventView): ShowcaseKind {
  const title = view.title.toLowerCase();
  if (title.includes("pernoite")) return "Pernoite";
  if (title.includes("bate e volta")) return "Bate e volta";
  if (!view.startsAt || !view.endsAt) return "Bate e volta";
  return tripDayOf(view.startsAt) === tripDayOf(view.endsAt) ? "Bate e volta" : "Pernoite";
}

function formatDateRange(startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt) return "";
  const fmt = (d: Date, withMonth: boolean) =>
    new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: withMonth ? "long" : undefined,
      timeZone: TRIP_TZ,
    }).format(d);
  const monthOf = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: TRIP_TZ }).format(d);

  if (!endsAt || tripDayOf(endsAt) === tripDayOf(startsAt)) {
    return fmt(startsAt, true);
  }
  return monthOf(startsAt) === monthOf(endsAt)
    ? `${fmt(startsAt, false)} a ${fmt(endsAt, true)}`
    : `${fmt(startsAt, true)} a ${fmt(endsAt, true)}`;
}

function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function heroImageOf(view: PublicEventView): string | null {
  const hero = view.page.blocks.find((b) => b.type === "hero");
  return hero && hero.type === "hero" && hero.config.images.length > 0
    ? hero.config.images[0]!
    : null;
}

/** (67) 99294-9342 a partir dos dígitos com DDI. */
function formatPhoneBR(digits: string): string {
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  const ddd = local.slice(0, 2);
  const number = local.slice(2);
  const split = number.length > 4 ? number.length - 4 : 0;
  return `(${ddd}) ${number.slice(0, split)}-${number.slice(split)}`;
}

/** Headline com a palavra de destaque em itálico/âmbar (1ª ocorrência). */
function renderHeadline(headline: string, highlight: string | null) {
  if (!highlight) return headline;
  const index = headline.toLowerCase().indexOf(highlight.toLowerCase());
  if (index < 0) return headline;
  return (
    <>
      {headline.slice(0, index)}
      <span className="italic text-[var(--sf-accent-text)]">{headline.slice(index, index + highlight.length)}</span>
      {headline.slice(index + highlight.length)}
    </>
  );
}

async function loadCards(
  organizationId: string,
  withKinds: boolean,
  vocab: OrgVocab,
): Promise<ShowcaseCardData[]> {
  const views = await getPublicEventViewsByOrganization(organizationId);
  const now = new Date();
  return views
    // Vitrine só do que ainda vai acontecer — encerrado some sozinho.
    .filter((view) => {
      const boundary = view.endsAt ?? view.startsAt;
      return boundary === null || boundary >= now;
    })
    .map((view) => {
      const available = view.batches.filter((b) => b.available);
      const priced = available.length > 0 ? available : view.batches;
      const prices = priced.map((b) => b.priceCents);
      const fromPrice = prices.length > 0 ? Math.min(...prices) : null;
      return {
        id: view.id,
        slug: view.slug,
        href: publicEventPath(view.slug, vocab),
        kind: withKinds ? tripKindOf(view) : null,
        dateLabel: formatDateRange(view.startsAt, view.endsAt),
        venueName: view.venueName ?? view.city,
        city: view.city,
        state: view.state,
        fromPriceLabel: fromPrice !== null ? fmtBRL(fromPrice) : null,
        image: heroImageOf(view),
        soldOut: view.batches.length > 0 && available.length === 0,
      };
    });
}

export default async function OrgStorefrontPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const storefront = await loadStorefront(orgSlug);
  if (!storefront) notFound();

  const { page, trustItems } = storefront;
  const vocab = orgVocab(storefront.niche);
  const isTravel = storefront.niche === "VIAGENS";
  const brandName = storefront.publicName ?? storefront.orgName;
  const whatsappHref = page.whatsapp ? `https://wa.me/${page.whatsapp}` : null;
  const cards = await loadCards(storefront.organizationId, isTravel, vocab);
  // Cor da org → tokens --sf-* (fallback âmbar); cascateiam pra grade client.
  const accentStyle = storefrontAccentTokens(page.brandColor) as CSSProperties;

  return (
    <div
      data-theme="dark"
      style={accentStyle}
      className={`${display.variable} min-h-svh bg-page text-ink`}
    >
      {/* Barra fina fixa — só marca + CTA, a apresentação fica pro hero */}
      <div className="sticky top-0 z-40 border-b border-line/60 bg-page/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-small font-bold uppercase tracking-[0.2em] text-[var(--sf-accent-text)]">
            {brandName}
          </span>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sf-accent)] px-3.5 py-1.5 text-small font-semibold text-[var(--sf-accent-fg)] transition-colors hover:bg-[var(--sf-accent-hover)]"
            >
              <MessageCircle className="size-3.5" /> WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Hero */}
      <header className="relative overflow-hidden">
        {page.heroImageUrl && (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.heroImageUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/55 to-page" />
          </div>
        )}
        <div className="relative mx-auto flex min-h-[70svh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center sm:min-h-[80svh]">
          {page.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.logoUrl}
              alt={brandName}
              className="h-24 w-24 object-contain sm:h-28 sm:w-28"
            />
          )}
          {page.tagline && (
            <p className="mt-6 text-caption font-semibold uppercase tracking-[0.2em] text-[var(--sf-accent-text)]">
              {page.tagline}
            </p>
          )}
          <h1
            className={`${display.className} mt-3 text-4xl font-semibold leading-tight text-white sm:text-6xl`}
          >
            {page.headline ? renderHeadline(page.headline, page.headlineHighlight) : brandName}
          </h1>
          {page.subheadline && (
            <p className="mx-auto mt-5 max-w-lg text-body text-white/80 sm:text-h4">
              {page.subheadline}
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#viagens"
              className="rounded-full bg-[var(--sf-accent)] px-6 py-3 text-small font-semibold text-[var(--sf-accent-fg)] transition-colors hover:bg-[var(--sf-accent-hover)]"
            >
              {vocab.upcomingCta}
            </a>
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/30 px-6 py-3 text-small font-semibold text-white transition-colors hover:bg-white/10"
              >
                Falar no WhatsApp
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Confiança */}
      {trustItems.length > 0 && (
        <section className="border-b border-line px-4 py-12 sm:py-16">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
            {trustItems.map((item) => {
              const Icon = TRUST_ICONS[item.icon];
              return (
                <div
                  key={item.title}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-6 text-center"
                >
                  <Icon className="size-6 text-[var(--sf-accent)]" />
                  <h2 className={`${display.className} text-h3 font-semibold text-ink`}>
                    {item.title}
                  </h2>
                  <p className="text-small text-ink-muted">{item.description}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Vitrine */}
      <main id="viagens" className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
        <div className="mb-10 text-center">
          <h2 className={`${display.className} text-h1 font-semibold text-ink sm:text-4xl`}>
            {vocab.upcomingTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-body text-ink-muted">
            {vocab.showcaseSubtitle}
          </p>
        </div>
        <ShowcaseGrid
          items={cards}
          showKindFilters={isTravel}
          emptyLabel={`Nenhuma ${isTravel ? "viagem" : "programação"} disponível no momento.`}
        />
      </main>

      {/* Footer / contato */}
      <footer className="border-t border-line bg-surface px-4 py-16 text-center sm:py-20">
        <h2 className={`${display.className} text-h1 font-semibold text-ink sm:text-4xl`}>
          {vocab.footerCtaTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-body text-ink-muted">{vocab.footerCtaSubtitle}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {whatsappHref && page.whatsapp && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--sf-accent)] px-5 py-2.5 font-semibold text-[var(--sf-accent-fg)] transition-colors hover:bg-[var(--sf-accent-hover)]"
            >
              <MessageCircle className="size-4" /> {formatPhoneBR(page.whatsapp)}
            </a>
          )}
          {page.instagram && (
            <a
              href={`https://instagram.com/${page.instagram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--sf-accent-border)] px-5 py-2.5 font-medium text-[var(--sf-accent-text)] transition-colors hover:bg-[var(--sf-accent-soft)]"
            >
              <AtSign className="size-4" /> {page.instagram}
            </a>
          )}
        </div>
        <div className="mx-auto mt-12 flex max-w-5xl flex-col items-center justify-between gap-2 border-t border-line pt-6 text-caption text-ink-faint sm:flex-row">
          <p>
            © {new Date().getFullYear()} {brandName.toUpperCase()} — vendas por Ingressos.
          </p>
          {page.footerNote && <p>{page.footerNote}</p>}
        </div>
      </footer>
    </div>
  );
}
