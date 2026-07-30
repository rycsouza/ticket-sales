import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import { AtSign, MessageCircle, ShieldCheck, Sparkles, Users } from "lucide-react";
import { getPublicEventViewsByOrganization, type PublicEventView } from "@/lib/public-views";
import { TripsGrid, type TripCardData } from "./trips-grid";

export const metadata: Metadata = {
  title: "Jovitur — Viagens e Excursões",
  description: "Excursões de ônibus saindo de Três Lagoas/MS para os melhores destinos do Brasil.",
};

// Fonte de exibição só desta LP artesanal — o produto usa Inter em todo o
// resto do app; aqui a marca pede uma cara mais editorial/agência de viagem.
const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
  variable: "--font-jovitur-display",
});

const WHATSAPP = "5567992949342";
const WHATSAPP_HREF = `https://wa.me/${WHATSAPP}`;
const INSTAGRAM = "jovitur_";
const JOVITUR_ORG_ID = "019fb090-0688-729b-9556-93d7dfd98ed0";
const LOGO_URL =
  "https://res.cloudinary.com/df798ispp/image/upload/v1785377445/orgs/jovitur/branding/nzlorxtthwx4pzkn45ty.webp";
const HERO_IMAGE =
  "https://res.cloudinary.com/df798ispp/image/upload/v1785375480/orgs/jovitur/destinos/jh42aamhhjtkzzxrgvpt.webp";

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

type TripKind = "Bate e volta" | "Pernoite";

/**
 * O título já carrega o rótulo do folheto ("Bate e Volta"/"Pernoite") — nem
 * sempre dá pra inferir isso só pela duração (tem "bate e volta" que cobre
 * 2 dias corridos). Sem o rótulo no título, cai pro fallback por data.
 */
function tripKindOf(view: PublicEventView): TripKind {
  const title = view.title.toLowerCase();
  if (title.includes("pernoite")) return "Pernoite";
  if (title.includes("bate e volta")) return "Bate e volta";
  if (!view.startsAt || !view.endsAt) return "Bate e volta";
  const dayOf = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  return dayOf(view.startsAt) === dayOf(view.endsAt) ? "Bate e volta" : "Pernoite";
}

function formatDateRange(startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt) return "";
  const fmt = (d: Date, withMonth: boolean) =>
    new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: withMonth ? "long" : undefined,
      timeZone: "America/Sao_Paulo",
    }).format(d);

  if (!endsAt || endsAt.toDateString() === startsAt.toDateString()) {
    return fmt(startsAt, true);
  }
  const sameMonth = startsAt.getMonth() === endsAt.getMonth();
  return sameMonth
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
  const views = await getPublicEventViewsByOrganization(JOVITUR_ORG_ID);
  return views.map((view) => {
    const prices = view.batches.map((b) => b.priceCents);
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
          <img src={HERO_IMAGE} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/55 to-page" />
        </div>
        <div className="relative mx-auto flex min-h-[70svh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center sm:min-h-[80svh]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_URL} alt="Jovitur — Viagens e Excursões" className="h-24 w-24 object-contain sm:h-28 sm:w-28" />
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
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
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
            href={`https://instagram.com/${INSTAGRAM}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 px-5 py-2.5 font-medium text-amber-400 transition-colors hover:bg-amber-500/10"
          >
            <AtSign className="size-4" /> {INSTAGRAM}
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
