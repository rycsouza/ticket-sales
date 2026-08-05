import type { OrgNiche } from "@ingressos/core";

/**
 * Vocabulário do produto por NICHO da produtora: uma agência de viagens vende
 * "viagens"/"vagas" com "embarque"; uma produtora de eventos vende
 * "eventos"/"ingressos" com "portaria". Nada muda no domínio — só rótulos e
 * os SEGMENTOS de URL exibidos (o filesystem de rotas continua eventos/evento;
 * o middleware reescreve viagens/viagem/vagas para lá).
 *
 * ATENÇÃO: "Ingressos" como MARCA do produto (títulos "… — Ingressos",
 * BrandMark, chaves ingressos:*) não é vocabulário — nunca trocar.
 */
export interface OrgVocab {
  /** gênero gramatical de event ("evento" m × "viagem" f) */
  gender: "m" | "f";
  /** gênero gramatical de ticket ("ingresso" m × "vaga" f) */
  ticketGender: "m" | "f";

  // — palavras: evento/viagem —
  event: string; // "evento" | "viagem"
  events: string; // "eventos" | "viagens"
  Event: string; // "Evento" | "Viagem"
  Events: string; // "Eventos" | "Viagens"
  theEvent: string; // "o evento" | "a viagem"
  ofEvent: string; // "do evento" | "da viagem"
  ofEvents: string; // "dos eventos" | "das viagens"
  oneEvent: string; // "um evento" | "uma viagem"
  thisEvent: string; // "este evento" | "esta viagem"
  inThisEvent: string; // "neste evento" | "nesta viagem"
  newEvent: string; // CTA de criação
  perEvent: string; // "por evento" | "por viagem"
  allEvents: string; // "Todos os eventos" | "Todas as viagens"
  searchEvents: string; // "Buscar eventos" | "Buscar viagens"
  filterByEvent: string; // "Filtrar por evento" | "Filtrar por viagem"
  noEventFound: string; // "Nenhum evento encontrado" | "Nenhuma viagem encontrada"

  // — palavras: ingresso/vaga —
  ticket: string; // "ingresso" | "vaga"
  tickets: string; // "ingressos" | "vagas"
  Ticket: string; // "Ingresso" | "Vaga"
  Tickets: string; // "Ingressos" | "Vagas"
  theTicket: string; // "o ingresso" | "a vaga"
  ofTicket: string; // "do ingresso" | "da vaga"
  ticketType: string; // "Tipo de ingresso" | "Tipo de vaga"
  newTicketType: string; // "Novo tipo de ingresso" | "Novo tipo de vaga"
  editTicket: string; // "Editar ingresso" | "Editar vaga"
  soldTickets: string; // "Ingressos vendidos" | "Vagas vendidas"
  perTicketSold: string; // "por ingresso vendido" | "por vaga vendida"
  ticketsAndBatches: string; // aba "Ingressos e lotes" | "Vagas e lotes"

  // — operação/lugar —
  checkinArea: string; // "Portaria" | "Embarque"
  venue: string; // "Local" | "Destino"
  attendee: string; // "participante" | "viajante"

  // — segmentos de URL exibidos —
  /** /painel/<org>/<eventsSegment>/… — "eventos" | "viagens" */
  eventsSegment: string;
  /** /<publicSegment>/<slug> — "evento" | "viagem" */
  publicSegment: string;

  // — checkout público —
  selectTickets: string;

  // — vitrine —
  upcomingTitle: string;
  upcomingCta: string;
  showcaseSubtitle: string;
  footerCtaTitle: string;
  footerCtaSubtitle: string;
}

const VOCAB: Record<OrgNiche, OrgVocab> = {
  EVENTOS: {
    gender: "m",
    ticketGender: "m",
    event: "evento",
    events: "eventos",
    Event: "Evento",
    Events: "Eventos",
    theEvent: "o evento",
    ofEvent: "do evento",
    ofEvents: "dos eventos",
    oneEvent: "um evento",
    thisEvent: "este evento",
    inThisEvent: "neste evento",
    newEvent: "Novo evento",
    perEvent: "por evento",
    allEvents: "Todos os eventos",
    searchEvents: "Buscar eventos",
    filterByEvent: "Filtrar por evento",
    noEventFound: "Nenhum evento encontrado",
    ticket: "ingresso",
    tickets: "ingressos",
    Ticket: "Ingresso",
    Tickets: "Ingressos",
    theTicket: "o ingresso",
    ofTicket: "do ingresso",
    ticketType: "Tipo de ingresso",
    newTicketType: "Novo tipo de ingresso",
    editTicket: "Editar ingresso",
    soldTickets: "Ingressos vendidos",
    perTicketSold: "por ingresso vendido",
    ticketsAndBatches: "Ingressos e lotes",
    checkinArea: "Portaria",
    venue: "Local",
    attendee: "participante",
    eventsSegment: "eventos",
    publicSegment: "evento",
    selectTickets: "Selecione seus ingressos",
    upcomingTitle: "Próximos eventos",
    upcomingCta: "Ver próximos eventos",
    showcaseSubtitle: "Escolha seu evento e garanta seu ingresso — os lotes são limitados.",
    footerCtaTitle: "Vamos pro próximo evento?",
    footerCtaSubtitle: "Fale com a gente pelo WhatsApp e garanta seu ingresso no próximo evento.",
  },
  VIAGENS: {
    gender: "f",
    ticketGender: "f",
    event: "viagem",
    events: "viagens",
    Event: "Viagem",
    Events: "Viagens",
    theEvent: "a viagem",
    ofEvent: "da viagem",
    ofEvents: "das viagens",
    oneEvent: "uma viagem",
    thisEvent: "esta viagem",
    inThisEvent: "nesta viagem",
    newEvent: "Nova viagem",
    perEvent: "por viagem",
    allEvents: "Todas as viagens",
    searchEvents: "Buscar viagens",
    filterByEvent: "Filtrar por viagem",
    noEventFound: "Nenhuma viagem encontrada",
    ticket: "vaga",
    tickets: "vagas",
    Ticket: "Vaga",
    Tickets: "Vagas",
    theTicket: "a vaga",
    ofTicket: "da vaga",
    ticketType: "Tipo de vaga",
    newTicketType: "Novo tipo de vaga",
    editTicket: "Editar vaga",
    soldTickets: "Vagas vendidas",
    perTicketSold: "por vaga vendida",
    ticketsAndBatches: "Vagas e lotes",
    checkinArea: "Embarque",
    venue: "Destino",
    attendee: "viajante",
    eventsSegment: "viagens",
    publicSegment: "viagem",
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

/**
 * Flexiona a terminação -o/-os para -a/-as quando o gênero é feminino:
 * flex("concluído", "f") → "concluída"; flex("vendidos", "f") → "vendidas".
 * Só mexe na ÚLTIMA palavra terminada em o/os — suficiente para particípios.
 */
export function flex(word: string, gender: "m" | "f"): string {
  if (gender === "m") return word;
  return word.replace(/o(s?)$/, "a$1");
}

/** Base do painel por nicho: /painel/<org>/<eventos|viagens>. */
export function panelEventsBase(orgSlug: string, vocab: OrgVocab): string {
  return `/painel/${orgSlug}/${vocab.eventsSegment}`;
}

/** URL pública do checkout por nicho: /<evento|viagem>/<slug>. */
export function publicEventPath(slug: string, vocab: OrgVocab): string {
  return `/${vocab.publicSegment}/${slug}`;
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
