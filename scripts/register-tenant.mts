/**
 * Registra (upsert) um tenant no platform DB (docs/MULTITENANT.md §7).
 *
 *   npx tsx scripts/register-tenant.mts \
 *     --id <org-uuid> --slug <slug> --name "<nome>" \
 *     --url "postgresql://…" [--direct-url "postgresql://…"] \
 *     [--status ACTIVE|PROVISIONING|SUSPENDED] [--plan pilot] [--commit]
 *
 * DRY-RUN por padrão: mostra o que faria sem escrever. Só grava com --commit.
 * O `id` deve ESPELHAR o Organization.id do banco do tenant. Idempotente por id.
 * Nunca ecoa URLs nem a chave — só metadados.
 */
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encryptWithKey } from "../packages/db/src/encryption.js";
import { getPlatformPrisma } from "../packages/db/src/platform.js";

loadDotenv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const id = arg("id");
const slug = arg("slug");
const name = arg("name");
const url = arg("url");
const directUrl = arg("direct-url");
const status = (arg("status") ?? "ACTIVE") as "ACTIVE" | "PROVISIONING" | "SUSPENDED";
const plan = arg("plan") ?? "pilot";
const commit = process.argv.includes("--commit");

const platformUrl = process.env.PLATFORM_DATABASE_URL;
const key = process.env.ENCRYPTION_KEY_PLATFORM_DB;

if (!id || !slug || !name || !url) {
  console.error("faltam argumentos: --id --slug --name --url (ver cabeçalho do script)");
  process.exit(1);
}
if (!platformUrl || !key) {
  console.error("PLATFORM_DATABASE_URL e ENCRYPTION_KEY_PLATFORM_DB são obrigatórios no ambiente/.env");
  process.exit(1);
}
if (!["ACTIVE", "PROVISIONING", "SUSPENDED"].includes(status)) {
  console.error(`status inválido: ${status}`);
  process.exit(1);
}

const platform = getPlatformPrisma(platformUrl);
const existing = await platform.tenant.findUnique({ where: { id } });

console.log(`tenant:  ${slug} (${id})`);
console.log(`ação:    ${existing ? "UPDATE" : "INSERT"} — status=${status} plan=${plan}`);
console.log(`urls:    database=<cifrada ${url.length} chars>${directUrl ? " direct=<cifrada>" : ""}`);

if (!commit) {
  console.log("\nDRY-RUN — nada gravado. Repita com --commit para efetivar.");
  process.exit(0);
}

const data = {
  slug,
  name,
  status,
  plan,
  databaseUrlEncrypted: encryptWithKey(url, key),
  directUrlEncrypted: directUrl ? encryptWithKey(directUrl, key) : null,
};
await platform.tenant.upsert({ where: { id }, create: { id, ...data }, update: data });
console.log("\nOK — tenant registrado.");
process.exit(0);
