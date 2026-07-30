import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Playfair_Display } from "next/font/google";
import { AtSign, MessageCircle, ShieldCheck, Sparkles, Users } from "lucide-react";
import { getPlatformServices } from "@/lib/services";
import { getPublicEventViewsByOrganization, type PublicEventView } from "@/lib/public-views";
import { TripsGrid, type TripCardData, type TripKind } from "./trips-grid";

// Fonte de exibição só desta LP artesanal — o produto usa Inter em todo o
// resto do app; aqui a marca pede uma cara mais editorial/agência de viagem.
const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
  variable: "--font-jovitur-display",
});

/**
 * Conteúdo da vitrine da produtora. A org é resolvida pelo SLUG na plataforma
 * (nada de UUID chumbado); o restante é conteúdo editorial desta LP. Quando a
 * "LP por produtora" virar feature de produto, este objeto migra para
 * configuração da org no banco.
 */
const SHOWCASE = {
  orgSlug: "jovitur",
  title: "Jovitur — Viagens e Excursões",
  description: "Excursões de ônibus saindo de Três Lagoas/MS para os melhores destinos do Brasil.",
  path: "/jovitur",
  whatsapp: "5567992949342",
  instagram: "jovitur_",
  logoUrl:
    "https://res.cloudinary.com/df798ispp/image/upload/v1785377445/orgs/jovitur/branding/nzlorxtthwx4pzkn45ty.webp",
  heroImage:
    "https://res.cloudinary.com/df798ispp/image/upload/v1785375480/orgs/jovitur/destinos/jh42aamhhjtkzzxrgvpt.webp",
  /**
   * Classificação EXPLÍCITA por slug do evento — vence a heurística de título.
   * Use quando o título não carrega o rótulo do folheto (ex.: bate e volta
   * que atravessa 2 dias corridos).
   */
  kindOverrides: {} as Record<string, TripKind>,
} as const;

const WHATSAPP_HREF = `https://wa.me/${SHOWCASE.whatsapp}`;
const BASE_URL = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// ISR: a vitrine lê o banco do tenant — sem isto a página congela no build
// (viagem encerrada nunca sai, evento novo nunca entra).
export const revalidate = 300;

export const metadata: Metadata = {
  title: SHOWCASE.title,
  description: SHOWCASE.description,
  alternates: { canonical: `${BASE_URL}${SHOWCASE.path}` },
  openGraph: {
    title: SHOWCASE.title,
    description: SHOWCASE.description,
    url: `${BASE_URL}${SHOWCASE.path}`,
    siteName: "Jovitur",
    locale: "pt_BR",
    type: "website",
    images: [{ url: SHOWCASE.heroImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: SHOWCASE.title,
    description: SHOWCASE.description,
    images: [SHOWCASE.heroImage],
  },
};

const TRUST_ITEMS = [
  {
    icon: ShieldCheck,
    title: "Segurança em 1º lugar",
    description: "Ônibus revisados e equipe atenta do embarque ao desembarque.",
  },
  {
    icon: Users,
    title: "Equipe especializada",
    description: "Suporte completo antes, durante e depois de cada excursão.",
  },
  {
    icon: Sparkles,
    title: "Guias credenciados CADASTUR",
    description: "Roteiros conduzidos por profissionais qualificados.",
  },
] as const;

const TRIP_TZ = "America/Sao_Paulo";

/** Dia-calendário no fuso da viagem (YYYY-MM-DD) — nunca o fuso do servidor. */
function tripDayOf(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TRIP_TZ }).format(d);
}

/**
 * Classificação: override explícito por slug > rótulo do folheto no título
 * ("Bate e Volta"/"Pernoite") > fallback por dia-calendário no fuso da viagem.
 */
function tripKindOf(view: PublicEventView): TripKind {
  const override = SHOWCASE.kindOverrides[view.slug];
  if (override) return override;
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

async function loadTrips(): Promise<TripCardData[]> {
  const org = await getPlatformServices().identity.getOrganizationBySlug(SHOWCASE.orgSlug);
  if (!org) notFound();
  const views = await getPublicEventViewsByOrganization(org.id);
  const now = new Date();
  return views
    // Vitrine só de viagens futuras/em curso — encerrada some sozinha.
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
        kind: tripKindOf(view),
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

export default async function JoviturLandingPage() {
  const trips = await loadTrips();

  return (
    <div data-theme="dark" className={`${display.variable} min-h-svh bg-page text-ink`}>
      {/* Barra fina fixa — só marca + CTA, a apresentação fica pro hero */}
      <div className="sticky top-0 z-40 border-b border-line/60 bg-page/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-small font-bold uppercase tracking-[0.2em] text-amber-400">Jovitur</span>
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3.5 py-1.5 text-small font-semibold text-black transition-colors hover:bg-amber-400"
          >
            <MessageCircle className="size-3.5" /> WhatsApp
          </a>
        </div>
      </div>

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SHOWCASE.heroImage} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/55 to-page" />
        </div>
        <div className="relative mx-auto flex min-h-[70svh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center sm:min-h-[80svh]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SHOWCASE.logoUrl} alt="Jovitur — Viagens e Excursões" className="h-24 w-24 object-contain sm:h-28 sm:w-28" />
          <p className="mt-6 text-caption font-semibold uppercase tracking-[0.2em] text-amber-400">
            Saindo de Três Lagoas/MS
          </p>
          <h1
            className={`${display.className} mt-3 text-4xl font-semibold leading-tight text-white sm:text-6xl`}
          >
            Sua próxima <span className="italic text-amber-400">viagem</span> começa aqui
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-body text-white/80 sm:text-h4">
            Excursões de ônibus para os melhores destinos do Brasil, com conforto, segurança e
            roteiro completo do início ao fim.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#viagens"
              className="rounded-full bg-amber-500 px-6 py-3 text-small font-semibold text-black transition-colors hover:bg-amber-400"
            >
              Ver próximas viagens
            </a>
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/30 px-6 py-3 text-small font-semibold text-white transition-colors hover:bg-white/10"
            >
              Falar no WhatsApp
            </a>
          </div>
        </div>
      </header>

      {/* Confiança */}
      <section className="border-b border-line px-4 py-12 sm:py-16">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
          {TRUST_ITEMS.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-6 text-center"
            >
              <Icon className="size-6 text-amber-500" />
              <h2 className={`${display.className} text-h3 font-semibold text-ink`}>{title}</h2>
              <p className="text-small text-ink-muted">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Vitrine de viagens */}
      <main id="viagens" className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
        <div className="mb-10 text-center">
          <h2 className={`${display.className} text-h1 font-semibold text-ink sm:text-4xl`}>
            Próximas viagens
          </h2>
          <p className="mx-auto mt-2 max-w-md text-body text-ink-muted">
            Escolha seu destino e garanta sua vaga — as saídas são limitadas.
          </p>
        </div>
        <TripsGrid trips={trips} />
      </main>

      {/* Footer / contato */}
      <footer className="border-t border-line bg-surface px-4 py-16 text-center sm:py-20">
        <h2 className={`${display.className} text-h1 font-semibold text-ink sm:text-4xl`}>
          Vamos planejar sua próxima viagem?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-body text-ink-muted">
          Fale com a gente pelo WhatsApp e garanta sua vaga na próxima excursão.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-2.5 font-semibold text-black transition-colors hover:bg-amber-400"
          >
            <MessageCircle className="size-4" /> (67) 99294-9342
          </a>
          <a
            href={`https://instagram.com/${SHOWCASE.instagram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 px-5 py-2.5 font-medium text-amber-400 transition-colors hover:bg-amber-500/10"
          >
            <AtSign className="size-4" /> {SHOWCASE.instagram}
          </a>
        </div>
        <div className="mx-auto mt-12 flex max-w-5xl flex-col items-center justify-between gap-2 border-t border-line pt-6 text-caption text-ink-faint sm:flex-row">
          <p>© {new Date().getFullYear()} JOVITUR — Criando memórias em cada viagem.</p>
          <p>Fotos ilustrativas dos destinos: Wikimedia Commons (CC BY-SA).</p>
        </div>
      </footer>
    </div>
  );
}
