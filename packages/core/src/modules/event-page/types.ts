import type { PageBlock } from "./schemas";

/**
 * Página pública personalizada de um evento. `blocks` já chega validado aqui:
 * o serviço re-parseia o JSON persistido e cai para os defaults quando o
 * conteúdo armazenado não passa no schema (a página pública nunca quebra).
 */
export interface EventPageRecord {
  eventId: string;
  organizationId: string;
  brandColor: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  faviconUrl: string | null;
  blocks: PageBlock[];
}

/** Tipos de imagem aceitos pelo upload da página. */
export type EventPageImageKind = "logo" | "banner" | "favicon" | "gallery";
