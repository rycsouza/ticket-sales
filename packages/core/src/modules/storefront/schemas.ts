import { z } from "zod";

// Só aceitamos URLs do nosso fluxo de upload (Cloudinary) — bloqueia hotlink
// arbitrário e injeção de URL externa na página pública (mesma regra da
// página de evento).
const assetUrlSchema = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((url) => url.startsWith("https://res.cloudinary.com/"), {
    message: "URL de imagem inválida",
  });

/** Tipos de imagem da vitrine — limites de tamanho por tipo no serviço. */
export const storefrontImageKindSchema = z.enum(["hero", "logo"]);
export type StorefrontImageKind = z.infer<typeof storefrontImageKindSchema>;

/** Ícones permitidos nos blocos de confiança (mapeados para Lucide na borda). */
export const trustIconSchema = z.enum([
  "shield",
  "users",
  "sparkles",
  "bus",
  "map",
  "star",
  "heart",
  "ticket",
]);

export const trustItemSchema = z
  .object({
    icon: trustIconSchema,
    title: z.string().trim().min(1).max(60),
    description: z.string().trim().min(1).max(160),
  })
  .strict();

export type TrustItem = z.infer<typeof trustItemSchema>;

/**
 * Allowlist estrita do que o produtor pode escrever na vitrine — campos de
 * sistema (enabled continua aqui pois é decisão do produtor; organizationId
 * NUNCA vem do cliente).
 */
export const updateOrgLandingPageSchema = z
  .object({
    enabled: z.boolean().optional(),
    tagline: z.string().trim().max(80).nullable().optional(),
    headline: z.string().trim().max(120).nullable().optional(),
    headlineHighlight: z.string().trim().max(40).nullable().optional(),
    subheadline: z.string().trim().max(240).nullable().optional(),
    heroImageUrl: assetUrlSchema.nullable().optional(),
    logoUrl: assetUrlSchema.nullable().optional(),
    whatsapp: z
      .string()
      .trim()
      .regex(/^\d{10,15}$/, "WhatsApp deve ter só dígitos (DDI+DDD+número)")
      .nullable()
      .optional(),
    instagram: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9._]{1,30}$/, "handle do Instagram inválido")
      .nullable()
      .optional(),
    trustItems: z.array(trustItemSchema).max(4).nullable().optional(),
    seoTitle: z.string().trim().max(90).nullable().optional(),
    seoDescription: z.string().trim().max(200).nullable().optional(),
    footerNote: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

export type UpdateOrgLandingPageInput = z.infer<typeof updateOrgLandingPageSchema>;

/** Re-valida o JSON de trustItems na LEITURA (JSON corrompido → lista vazia). */
export function parseStoredTrustItems(value: unknown): TrustItem[] {
  const result = z.array(trustItemSchema).safeParse(value);
  return result.success ? result.data : [];
}
