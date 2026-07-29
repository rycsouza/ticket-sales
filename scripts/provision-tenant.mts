/**
 * Provisiona um tenant (docs/MULTITENANT.md §7): cria/recebe o banco, roda as
 * migrations de aplicação nele e registra no platform DB com a URL CIFRADA.
 *
 *   npx tsx scripts/provision-tenant.mts \
 *     --id <org-uuid> --slug <slug> --name "<nome>" \
 *     ( --url "postgresql://…" [--direct-url "…"]     # banco já criado
 *     | --create-database <nome_db>                    # dev: database no MESMO host do DATABASE_URL
 *     | --neon-project <nome>                          # prod: projeto Neon novo (requer NEON_API_KEY) )
 *     [--skip-migrations] [--commit]
 *
 * DRY-RUN por padrão. Nunca ecoa URLs/segredos. O `id` deve espelhar o
 * Organization.id (platform DB). Idempotente: re-rodar re-migra e re-registra.
 */
import { config as loadDotenv } from "dotenv";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { encryptWithKey } from "../packages/db/src/encryption.js";
import { getPlatformPrisma } from "../packages/db/src/platform.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv({ path: path.join(ROOT, ".env") });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const id = arg("id");
const slug = arg("slug");
const name = arg("name");
const commit = has("commit");
let url = arg("url");
let directUrl = arg("direct-url");
const createDb = arg("create-database");
const neonProject = arg("neon-project");

const platformUrl = process.env.PLATFORM_DATABASE_URL;
const key = process.env.ENCRYPTION_KEY_PLATFORM_DB;
if (!id || !slug || !name || (!url && !createDb && !neonProject)) {
  console.error("uso: ver cabeçalho do script (faltam --id/--slug/--name e uma fonte de banco)");
  process.exit(1);
}
if (!platformUrl || !key) {
  console.error("PLATFORM_DATABASE_URL e ENCRYPTION_KEY_PLATFORM_DB são obrigatórios");
  process.exit(1);
}

function swapDatabase(baseUrl: string, database: string): string {
  const u = new URL(baseUrl);
  u.pathname = `/${database}`;
  return u.toString();
}

// --- 1. Fonte do banco -------------------------------------------------------
if (createDb) {
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(createDb)) {
    console.error("--create-database: use [a-z][a-z0-9_]{2,40}");
    process.exit(1);
  }
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!base) {
    console.error("--create-database requer DIRECT_URL/DATABASE_URL no ambiente");
    process.exit(1);
  }
  console.log(`banco: CREATE DATABASE ${createDb} (mesmo host do ambiente)`);
  if (commit) {
    const sql = neon(base);
    try {
      await sql.query(`CREATE DATABASE ${createDb}`);
      console.log("banco: criado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("already exists")) throw e;
      console.log("banco: já existia (ok)");
    }
  }
  url = swapDatabase(process.env.DATABASE_URL ?? base, createDb);
  directUrl = swapDatabase(process.env.DIRECT_URL ?? base, createDb);
} else if (neonProject) {
  const apiKey = process.env.NEON_API_KEY;
  if (!apiKey) {
    console.error("--neon-project requer NEON_API_KEY no ambiente");
    process.exit(1);
  }
  console.log(`banco: projeto Neon novo "${neonProject}" (1 projeto por tenant)`);
  if (commit) {
    const response = await fetch("https://console.neon.tech/api/v2/projects", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ project: { name: neonProject } }),
    });
    if (!response.ok) {
      console.error(`Neon API falhou: HTTP ${response.status}`);
      process.exit(1);
    }
    const data = (await response.json()) as { connection_uris?: { connection_uri: string }[] };
    const uri = data.connection_uris?.[0]?.connection_uri;
    if (!uri) {
      console.error("Neon API não retornou connection_uri");
      process.exit(1);
    }
    // A URI direta vem da API; a pooled troca o host para o pooler do Neon.
    directUrl = uri;
    url = uri.replace(/@([^./]+)\./, "@$1-pooler.");
  }
}

// --- 2. Migrations de aplicação no banco do tenant ---------------------------
if (!has("skip-migrations")) {
  console.log("migrations: prisma migrate deploy (schema de aplicação)");
  if (commit) {
    const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: path.join(ROOT, "packages/db"),
      env: {
        ...process.env,
        DATABASE_URL: url as string,
        DIRECT_URL: (directUrl ?? url) as string,
        DOTENV_CONFIG_QUIET: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    const out = `${result.stdout}\n${result.stderr}`;
    if (result.status !== 0) {
      // Nunca ecoar a URL — só o resumo do Prisma.
      console.error("migrations FALHARAM:\n" + out.split("\n").slice(-12).join("\n"));
      process.exit(1);
    }
    console.log("migrations: ok");
  }
}

// --- 3. Registro no platform DB (URL cifrada) --------------------------------
console.log(`tenant:  ${slug} (${id}) → status=ACTIVE`);
if (!commit) {
  console.log("\nDRY-RUN — nada criado/migrado/registrado. Repita com --commit.");
  process.exit(0);
}
const platform = getPlatformPrisma(platformUrl);
const data = {
  slug,
  name,
  status: "ACTIVE" as const,
  databaseUrlEncrypted: encryptWithKey(url as string, key),
  directUrlEncrypted: directUrl ? encryptWithKey(directUrl, key) : null,
};
await platform.tenant.upsert({ where: { id }, create: { id, ...data }, update: data });
console.log("\nOK — tenant provisionado e registrado. Lembre de invalidar caches/redeploy se trocou URL.");
process.exit(0);
