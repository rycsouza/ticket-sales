import { z } from "zod";

// Cor de marca do produtor: #rrggbb estrito, normalizada para minúsculas.
// O front deriva as variações (hover/active/soft/border/fg) a partir dela.
export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "cor deve estar no formato #rrggbb")
  .transform((value) => value.toLowerCase());

// Só aceitamos URLs emitidas pelo nosso próprio fluxo de upload (Cloudinary).
// Bloqueia hotlink arbitrário e injeção de URLs externas na página pública.
const assetUrlSchema = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((url) => url.startsWith("https://res.cloudinary.com/"), {
    message: "URL de imagem inválida",
  });

const blockIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/, "id de bloco inválido");

// ---------------------------------------------------------------------------
// Catálogo de blocos (discriminated union). Blocos carregam conteúdo, ordem e
// visibilidade; a identidade visual (cor/logo/banner/favicon) vive nas colunas
// da página. Tipos novos (faq, lineup, gallery…) entram estendendo a union.
// ---------------------------------------------------------------------------

const heroBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("hero"),
    visible: z.boolean().default(true),
    config: z
      .object({
        showLogo: z.boolean().default(true),
        showTitle: z.boolean().default(true),
        showDate: z.boolean().default(true),
        overlay: z.enum(["none", "dark", "brand"]).default("dark"),
      })
      .strict(),
  })
  .strict();

const descriptionBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("description"),
    visible: z.boolean().default(true),
    config: z
      .object({
        heading: z.string().trim().max(80).optional(),
        // null = usa Event.description; texto próprio substitui sem tocar o evento
        text: z.string().trim().max(5000).nullable().default(null),
      })
      .strict(),
  })
  .strict();

const locationBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("location"),
    visible: z.boolean().default(true),
    config: z
      .object({
        heading: z.string().trim().max(80).optional(),
        note: z.string().trim().max(500).optional(),
        // Mapa embedado (Google Maps por endereço) + botão "como chegar"
        showMap: z.boolean().default(false),
      })
      .strict(),
  })
  .strict();

// O checkout é o propósito da página: exatamente um, sempre visível.
const ticketsBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("tickets"),
    visible: z.literal(true),
    config: z
      .object({
        heading: z.string().trim().max(80).optional(),
      })
      .strict(),
  })
  .strict();

const organizerBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("organizer"),
    visible: z.boolean().default(true),
    config: z
      .object({
        showLogo: z.boolean().default(true),
        contactText: z.string().trim().max(300).optional(),
        // Redes/contatos — validados por formato, renderizados como links
        instagram: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9._]{1,30}$/, "usuário do Instagram inválido")
          .optional(),
        whatsapp: z
          .string()
          .trim()
          .regex(/^\d{10,15}$/, "WhatsApp deve ter só dígitos com DDD (ex.: 11999998888)")
          .optional(),
        website: z
          .string()
          .trim()
          .url()
          .max(200)
          .refine((u) => u.startsWith("https://"), "site deve começar com https://")
          .optional(),
      })
      .strict(),
  })
  .strict();

const faqBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("faq"),
    visible: z.boolean().default(true),
    config: z
      .object({
        heading: z.string().trim().max(80).optional(),
        items: z
          .array(
            z
              .object({
                question: z.string().trim().min(1).max(200),
                answer: z.string().trim().min(1).max(2000),
              })
              .strict(),
          )
          .min(1)
          .max(20),
      })
      .strict(),
  })
  .strict();

const lineupBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("lineup"),
    visible: z.boolean().default(true),
    config: z
      .object({
        heading: z.string().trim().max(80).optional(),
        items: z
          .array(
            z
              .object({
                name: z.string().trim().min(1).max(120),
                // Texto livre curto ("22h", "Palco 2 — 23h30") — exibição apenas
                time: z.string().trim().max(40).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(50),
      })
      .strict(),
  })
  .strict();

const galleryBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("gallery"),
    visible: z.boolean().default(true),
    config: z
      .object({
        heading: z.string().trim().max(80).optional(),
        // Só URLs emitidas pelo nosso upload (mesma allowlist das demais imagens)
        images: z.array(assetUrlSchema).min(1).max(12),
      })
      .strict(),
  })
  .strict();

const videoBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("video"),
    visible: z.boolean().default(true),
    config: z
      .object({
        heading: z.string().trim().max(80).optional(),
        // Só o ID do YouTube (11 chars) — nunca URL/HTML livre; o front monta
        // o embed em youtube-nocookie.com
        youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, "ID de vídeo do YouTube inválido"),
      })
      .strict(),
  })
  .strict();

const countdownBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("countdown"),
    visible: z.boolean().default(true),
    config: z
      .object({
        // Conta até o início do evento (startsAt); some após começar
        heading: z.string().trim().max(80).optional(),
      })
      .strict(),
  })
  .strict();

export const pageBlockSchema = z.discriminatedUnion("type", [
  heroBlockSchema,
  descriptionBlockSchema,
  locationBlockSchema,
  ticketsBlockSchema,
  organizerBlockSchema,
  faqBlockSchema,
  lineupBlockSchema,
  galleryBlockSchema,
  videoBlockSchema,
  countdownBlockSchema,
]);

export type PageBlock = z.infer<typeof pageBlockSchema>;
export type PageBlockType = PageBlock["type"];

export const eventPageBlocksSchema = z
  .array(pageBlockSchema)
  .max(20)
  .refine((blocks) => blocks.filter((b) => b.type === "tickets").length === 1, {
    message: "a página precisa de exatamente um bloco de ingressos",
  })
  .refine((blocks) => new Set(blocks.map((b) => b.id)).size === blocks.length, {
    message: "ids de bloco duplicados",
  });

// Allowlist estrita — organizationId/eventId vêm do contexto autenticado,
// nunca do corpo (CLAUDE_SECURITY_RULES §8).
export const updateEventPageSchema = z
  .object({
    brandColor: hexColorSchema.nullable().optional(),
    logoUrl: assetUrlSchema.nullable().optional(),
    bannerUrl: assetUrlSchema.nullable().optional(),
    faviconUrl: assetUrlSchema.nullable().optional(),
    backgroundUrl: assetUrlSchema.nullable().optional(),
    blocks: eventPageBlocksSchema.optional(),
  })
  .strict();

export type UpdateEventPageInput = z.infer<typeof updateEventPageSchema>;

export const eventPageImageKindSchema = z.enum([
  "logo",
  "banner",
  "favicon",
  "gallery",
  "background",
]);

/**
 * Página default — reproduz exatamente o layout público atual (hero textual,
 * descrição do evento, checkout). Eventos sem configuração renderizam isto.
 */
export function defaultPageBlocks(): PageBlock[] {
  return [
    {
      id: "hero",
      type: "hero",
      visible: true,
      config: { showLogo: false, showTitle: true, showDate: true, overlay: "dark" },
    },
    { id: "description", type: "description", visible: true, config: { text: null } },
    { id: "tickets", type: "tickets", visible: true, config: {} },
  ];
}
