/**
 * Cria a ORGANIZAÇÃO de um novo tenant no platform DB (passo 1 do onboarding;
 * o banco dedicado vem depois, via provision-tenant.mts):
 *
 *   - Organization (slug único, nicho, fuso, taxa padrão)
 *   - Usuário dono (reusa por e-mail; senha só para usuário NOVO, hash argon2id)
 *   - Membership OWNER ACTIVE
 *   - OrgLandingPage opcional (cor da marca; página nasce DESABILITADA)
 *
 *   npx tsx scripts/create-tenant.mts \
 *     --name "<nome>" [--slug <slug>] \
 *     [--niche EVENTOS|VIAGENS] [--timezone <IANA>] \
 *     --owner-email <email> --owner-name "<nome>" [--owner-password <senha>] \
 *     [--brand-color "#rrggbb"] [--fee-bps <int>] [--fee-mode BUYER|PRODUCER] \
 *     [--commit]
 *
 * (também roda com: node --experimental-strip-types scripts/create-tenant.mts …)
 *
 * DRY-RUN por padrão: mostra o plano sem escrever. Só grava com --commit.
 * Ao final imprime o Organization.id — entrada do provision-tenant.mts.
 * Nunca ecoa senha/hash/URLs. Slug já existente = erro (nada é sobrescrito).
 */
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformPrisma } from "../packages/db/src/platform.ts";
import { Argon2PasswordHasher } from "../packages/adapters/src/password/argon2.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv({ path: path.join(ROOT, ".env") });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const name = arg("name");
const ownerEmail = arg("owner-email")?.trim().toLowerCase();
const ownerName = arg("owner-name");
const ownerPassword = arg("owner-password");
const niche = (arg("niche") ?? "EVENTOS").toUpperCase();
const timezone = arg("timezone") ?? "America/Sao_Paulo";
const brandColor = arg("brand-color");
const feeBps = Number(arg("fee-bps") ?? "0");
const feeMode = (arg("fee-mode") ?? "PRODUCER").toUpperCase();
const commit = has("commit");

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const slug = arg("slug") ?? (name ? slugify(name) : undefined);

if (!name || !slug || !ownerEmail || !ownerName) {
  console.error("uso: ver cabeçalho (obrigatórios: --name, --owner-email, --owner-name)");
  process.exit(1);
}
if (!/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(slug)) {
  console.error(`slug inválido: "${slug}" (use minúsculas/números/hífens)`);
  process.exit(1);
}
if (niche !== "EVENTOS" && niche !== "VIAGENS") {
  console.error("--niche deve ser EVENTOS ou VIAGENS");
  process.exit(1);
}
if (feeMode !== "BUYER" && feeMode !== "PRODUCER") {
  console.error("--fee-mode deve ser BUYER ou PRODUCER");
  process.exit(1);
}
if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 5000) {
  console.error("--fee-bps deve ser inteiro 0..5000 (basis points; 500 = 5%)");
  process.exit(1);
}
if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
  console.error('--brand-color deve ser "#rrggbb"');
  process.exit(1);
}
// Mesma validação IANA usada no app (Intl lança para zona desconhecida).
try {
  new Intl.DateTimeFormat("pt-BR", { timeZone: timezone });
} catch {
  console.error(`--timezone inválido: "${timezone}"`);
  process.exit(1);
}
if (!process.env.PLATFORM_DATABASE_URL) {
  console.error("PLATFORM_DATABASE_URL é obrigatório no .env");
  process.exit(1);
}

const prisma = getPlatformPrisma(process.env.PLATFORM_DATABASE_URL);

const slugTaken = await prisma.organization.findUnique({ where: { slug } });
if (slugTaken) {
  console.error(`slug "${slug}" já pertence à org "${slugTaken.name}" (${slugTaken.id}) — aborte ou escolha outro`);
  process.exit(1);
}

const existingUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
if (!existingUser && !ownerPassword) {
  console.error(`usuário ${ownerEmail} não existe — informe --owner-password para criá-lo`);
  process.exit(1);
}
if (existingUser && ownerPassword) {
  console.log("aviso: usuário já existe — --owner-password será IGNORADO (senha não é trocada)");
}

console.log(`org:     ${name} (slug=${slug}) · niche=${niche} · tz=${timezone}`);
console.log(`taxa:    ${feeBps} bps · paga: ${feeMode}`);
console.log(`dono:    ${ownerEmail} (${existingUser ? "usuário existente" : "usuário NOVO"}) → OWNER`);
console.log(`vitrine: ${brandColor ? `brandColor=${brandColor} (página desabilitada até configurar)` : "sem config (usa defaults)"}`);

if (!commit) {
  console.log("\nDRY-RUN — nada criado. Repita com --commit.");
  process.exit(0);
}

const user =
  existingUser ??
  (await prisma.user.create({
    data: {
      email: ownerEmail,
      name: ownerName,
      passwordHash: await new Argon2PasswordHasher().hash(ownerPassword as string),
    },
  }));

const org = await prisma.organization.create({
  data: {
    name,
    slug,
    niche: niche as "EVENTOS" | "VIAGENS",
    timezone,
    defaultPlatformFeeBps: feeBps,
    defaultFeeMode: feeMode as "BUYER" | "PRODUCER",
  },
});

await prisma.membership.create({
  data: { organizationId: org.id, userId: user.id, role: "OWNER", status: "ACTIVE" },
});

if (brandColor) {
  await prisma.orgLandingPage.create({
    data: { organizationId: org.id, brandColor, enabled: false },
  });
}

console.log(`\nOK — organização criada. Organization.id = ${org.id}`);
console.log("Próximo passo (banco dedicado, MT-6):");
console.log(
  `  npx tsx scripts/provision-tenant.mts --id ${org.id} --slug ${slug} --name "${name}" --neon-project ingressos-${slug} --commit`,
);
process.exit(0);
