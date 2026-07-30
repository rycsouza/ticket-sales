import type { OrgNiche } from "@ingressos/core";

/**
 * Vocabulário do produto por NICHO da produtora: uma agência de viagens vende
 * "viagens"/"vagas" com "embarque"; uma produtora de eventos vende
 * "eventos"/"ingressos" com "portaria". Nada muda no domínio — só rótulos.
 */
export interface OrgVocab {
  /** "evento" | "viagem" (singular, minúsculo) */
  event: string;
  /** "eventos" | "viagens" (plural, minúsculo) */
  events: string;
  /** "Eventos" | "Viagens" (título/nav) */
  Events: string;
  /** CTA de criação */
  newEvent: string;
  /** "ingresso" | "vaga" */
  ticket: string;
  /** "ingressos" | "vagas" */
  tickets: string;
  /** "Ingressos" | "Vagas" (título/aba) */
  Tickets: string;
  /** Área de admissão: "Portaria" | "Embarque" */
  checkinArea: string;
  /** "Local" | "Destino" */
  venue: string;
  /** "participante" | "viajante" */
  attendee: string;
  /** Instrução do passo 1 do checkout */
  selectTickets: string;
  /** Vitrine pública: título da grade */
  upcomingTitle: string;
  /** Vitrine pública: CTA do hero */
  upcomingCta: string;
  /** Vitrine pública: subtítulo da grade */
  showcaseSubtitle: string;
  /** Vitrine pública: título do rodapé */
  footerCtaTitle: string;
  /** Vitrine pública: subtítulo do rodapé */
  footerCtaSubtitle: string;
}

const VOCAB: Record<OrgNiche, OrgVocab> = {
  EVENTOS: {
    event: "evento",
    events: "eventos",
    Events: "Eventos",
    newEvent: "Novo evento",
    ticket: "ingresso",
    tickets: "ingressos",
    Tickets: "Ingressos",
    checkinArea: "Portaria",
    venue: "Local",
    attendee: "participante",
    selectTickets: "Selecione seus ingressos",
    upcomingTitle: "Próximos eventos",
    upcomingCta: "Ver próximos eventos",
    showcaseSubtitle: "Escolha seu evento e garanta seu ingresso — os lotes são limitados.",
    footerCtaTitle: "Vamos pro próximo evento?",
    footerCtaSubtitle: "Fale com a gente pelo WhatsApp e garanta seu ingresso no próximo evento.",
  },
  VIAGENS: {
    event: "viagem",
    events: "viagens",
    Events: "Viagens",
    newEvent: "Nova viagem",
    ticket: "vaga",
    tickets: "vagas",
    Tickets: "Vagas",
    checkinArea: "Embarque",
    venue: "Destino",
    attendee: "viajante",
    selectTickets: "Selecione suas vagas",
    upcomingTitle: "Próximas viagens",
    upcomingCta: "Ver próximas viagens",
    showcaseSubtitle: "Escolha seu destino e garanta sua vaga — as saídas são limitadas.",
    footerCtaTitle: "Vamos planejar sua próxima viagem?",
    footerCtaSubtitle: "Fale com a gente pelo WhatsApp e garanta sua vaga na próxima excursão.",
  },
};

export function orgVocab(niche: OrgNiche | null | undefined): OrgVocab {
  return VOCAB[niche ?? "EVENTOS"];
}

/** Rótulos do seletor de nicho (criação da org / configurações). */
export const NICHE_OPTIONS: { value: OrgNiche; label: string }[] = [
  { value: "EVENTOS", label: "Eventos (shows, festas, produções)" },
  { value: "VIAGENS", label: "Viagens e turismo (agência, excursões)" },
];

/** Fusos brasileiros mais comuns — cobre todas as UFs. */
export const BR_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/Sao_Paulo", label: "Brasília / São Paulo (GMT-3)" },
  { value: "America/Campo_Grande", label: "Campo Grande — MS (GMT-4)" },
  { value: "America/Cuiaba", label: "Cuiabá — MT (GMT-4)" },
  { value: "America/Manaus", label: "Manaus — AM (GMT-4)" },
  { value: "America/Porto_Velho", label: "Porto Velho — RO (GMT-4)" },
  { value: "America/Boa_Vista", label: "Boa Vista — RR (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco — AC (GMT-5)" },
  { value: "America/Belem", label: "Belém — PA (GMT-3)" },
  { value: "America/Fortaleza", label: "Fortaleza — CE (GMT-3)" },
  { value: "America/Recife", label: "Recife — PE (GMT-3)" },
  { value: "America/Bahia", label: "Salvador — BA (GMT-3)" },
  { value: "America/Araguaina", label: "Palmas — TO (GMT-3)" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT-2)" },
];
