/**
 * Move um tenant existente para um PROJETO Neon dedicado (paridade com PROD,
 * docs/MULTITENANT.md §7): cria o projeto, migra o schema, copia os dados do
 * banco atual do tenant, valida contagens e só então troca a URL cifrada no
 * registro do tenant (cut). O banco antigo NÃO é apagado (cleanup manual).
 *
 *   npx tsx scripts/move-tenant-to-neon-project.mts \
 *     --slug <slug> [--project <nome>] [--region <region_id>] [--commit]
 *
 * DRY-RUN por padrão (não cria projeto, não copia, não corta). Requer
 * NEON_API_KEY, PLATFORM_DATABASE_URL e ENCRYPTION_KEY_PLATFORM_DB.
 * Idempotente: re-rodar reusa o projeto pelo nome e re-copia por upsert.
 * Nunca ecoa URLs/segredos.
 */
import { config as loadDotenv } from "dotenv";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { decryptWithKey, encryptWithKey } from "../packages/db/src/encryption.js";
import { getPrisma } from "../packages/db/src/index.js";
import { getPlatformPrisma } from "../packages/db/src/platform.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv({ path: path.join(ROOT, ".env") });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const slug = arg("slug");
const commit = process.argv.includes("--commit");
const projectName = arg("project") ?? (slug ? `ingressos-${slug}` : undefined);
const regionId = arg("region") ?? "aws-us-east-1";

const platformUrl = process.env.PLATFORM_DATABASE_URL;
const key = process.env.ENCRYPTION_KEY_PLATFORM_DB;
const apiKey = process.env.NEON_API_KEY;
if (!slug || !platformUrl || !key) {
  console.error("uso: --slug <slug> (+ PLATFORM_DATABASE_URL/ENCRYPTION_KEY_PLATFORM_DB no .env)");
  process.exit(1);
}
if (commit && !apiKey) {
  console.error("--commit requer NEON_API_KEY no ambiente");
  process.exit(1);
}

// --- 0. Tenant atual (origem) -------------------------------------------------
const platform = getPlatformPrisma(platformUrl);
const tenant = await platform.tenant.findUnique({ where: { slug } });
if (!tenant) {
  console.error("tenant não encontrado no platform DB");
  process.exit(1);
}
const sourceUrl = decryptWithKey(tenant.databaseUrlEncrypted, key);
const sourceDirectUrl = tenant.directUrlEncrypted
  ? decryptWithKey(tenant.directUrlEncrypted, key)
  : sourceUrl;
console.log(`tenant:  ${tenant.slug} (${tenant.id}) status=${tenant.status}`);
console.log(`projeto: "${projectName}" em ${regionId} (1 projeto Neon por tenant)`);

// --- 1. Projeto Neon dedicado (cria ou reusa pelo nome) -----------------------
const NEON_API = "https://console.neon.tech/api/v2";
async function neonApi(pathname: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${NEON_API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    // Nunca ecoar o body inteiro (pode conter URIs); só status + code.
    let code = "";
    try {
      code = ((await response.json()) as { code?: string }).code ?? "";
    } catch {
      /* body não-JSON */
    }
    throw new Error(`Neon API ${pathname.split("?")[0]}: HTTP ${response.status} ${code}`);
  }
  return response;
}

let targetUrl = "";
let targetDirectUrl = "";
if (commit) {
  const search = (await (await neonApi(`/projects?search=${encodeURIComponent(projectName!)}`)).json()) as {
    projects: { id: string; name: string }[];
  };
  const existing = search.projects.find((p) => p.name === projectName);
  if (existing) {
    console.log(`projeto: já existe (${existing.id}) — reusando`);
    const uri = (await (
      await neonApi(
        `/projects/${existing.id}/connection_uri?role_name=neondb_owner&database_name=neondb&pooled=false`,
      )
    ).json()) as { uri: string };
    targetDirectUrl = uri.uri;
  } else {
    const created = (await (
      await neonApi(`/projects`, {
        method: "POST",
        body: JSON.stringify({ project: { name: projectName, region_id: regionId } }),
      })
    ).json()) as { project: { id: string }; connection_uris?: { connection_uri: string }[] };
    const uri = created.connection_uris?.[0]?.connection_uri;
    if (!uri) {
      console.error("Neon API não retornou connection_uri");
      process.exit(1);
    }
    console.log(`projeto: criado (${created.project.id})`);
    targetDirectUrl = uri;
  }
  targetUrl = targetDirectUrl.replace(/@([^./]+)\./, "@$1-pooler.");
} else {
  console.log("projeto: (dry-run) seria criado/reusado via NEON_API_KEY");
}

// --- 2. Migrations de aplicação no banco novo ---------------------------------
if (commit) {
  console.log("migrations: prisma migrate deploy (banco novo)");
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: path.join(ROOT, "packages/db"),
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
      DIRECT_URL: targetDirectUrl,
      DOTENV_CONFIG_QUIET: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.status !== 0) {
    // Nunca ecoar a URL — só o resumo do Prisma.
    console.error(
      "migrations FALHARAM:\n" + `${result.stdout}\n${result.stderr}`.split("\n").slice(-12).join("\n"),
    );
    process.exit(1);
  }
  console.log("migrations: ok");
}

// --- 3. Cópia dos dados (origem = banco atual do tenant) ----------------------
/**
 * Timestamps: colunas `timestamp` sem fuso (valor = UTC). O driver HTTP do Neon
 * devolve string naive e o parse aplicaria o fuso LOCAL, deslocando tudo.
 * Serializar como ISO-UTC no SQL elimina a ambiguidade na origem.
 */
async function selectAllIsoUtc(
  db: ReturnType<typeof neon>,
  table: string,
): Promise<Record<string, unknown>[]> {
  const cols = (await db.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table],
  )) as { column_name: string; data_type: string }[];
  const list = cols
    .map((c) =>
      c.data_type.startsWith("timestamp")
        ? `to_char("${c.column_name}", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "${c.column_name}"`
        : `"${c.column_name}"`,
    )
    .join(", ");
  return (await db.query(`SELECT ${list} FROM "${table}"`)) as Record<string, unknown>[];
}

// Ordem segura de FK (pais antes de filhos) — mesma lista de copy-tenant-data.
const TABLES: { table: string; model: string; pk?: string }[] = [
  { table: "Event", model: "event" },
  { table: "EventPage", model: "eventPage" },
  { table: "Sector", model: "sector" },
  { table: "TicketType", model: "ticketType" },
  { table: "SalesBatch", model: "salesBatch" },
  { table: "Product", model: "product" },
  { table: "Offer", model: "offer" },
  { table: "Order", model: "order" },
  { table: "OrderItem", model: "orderItem" },
  { table: "Payment", model: "payment" },
  { table: "InventoryReservation", model: "inventoryReservation" },
  { table: "Ticket", model: "ticket" },
  { table: "Promoter", model: "promoter" },
  { table: "PromoterAssignment", model: "promoterAssignment" },
  { table: "PromoterLink", model: "promoterLink" },
  { table: "Coupon", model: "coupon" },
  { table: "CommissionRule", model: "commissionRule" },
  { table: "OrderAttribution", model: "orderAttribution" },
  { table: "CommissionEntry", model: "commissionEntry" },
  { table: "LedgerEntry", model: "ledgerEntry" },
  { table: "CheckinAssignment", model: "checkinAssignment" },
  { table: "Checkin", model: "checkin" },
  { table: "Customer", model: "customer" },
  { table: "OrderNote", model: "orderNote" },
  { table: "Notification", model: "notification" },
  { table: "AuditEvent", model: "auditEvent" },
  { table: "IdempotencyKey", model: "idempotencyKey", pk: "key" },
];

const source = neon(sourceDirectUrl);
const target = commit ? getPrisma(targetUrl) : null;
let mismatches = 0;
for (const { table, model, pk = "id" } of TABLES) {
  const rows = await selectAllIsoUtc(source, table);
  if (!commit) {
    if (rows.length > 0) console.log(`${table}: ${rows.length} linha(s) a copiar (dry-run)`);
    continue;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (target as any)[model];
  for (const row of rows) {
    const { [pk]: pkValue, ...rest } = row as Record<string, unknown>;
    await delegate.upsert({
      where: { [pk]: pkValue },
      create: { [pk]: pkValue, ...rest },
      update: rest,
    });
  }
  const targetCount = await delegate.count();
  const ok = targetCount >= rows.length;
  if (!ok) mismatches += 1;
  if (rows.length > 0 || targetCount > 0) {
    console.log(`${table}: origem=${rows.length} destino=${targetCount} ${ok ? "OK" : "DIVERGENTE"}`);
  }
}

// --- 4. Cut: troca a URL cifrada no registro do tenant ------------------------
if (!commit) {
  console.log("\nDRY-RUN — nada criado/copiado/cortado. Repita com --commit.");
  process.exit(0);
}
if (mismatches > 0) {
  console.error(`\n${mismatches} tabela(s) DIVERGENTE(s) — cut ABORTADO (registro do tenant intacto).`);
  process.exit(1);
}
await platform.tenant.update({
  where: { id: tenant.id },
  data: {
    databaseUrlEncrypted: encryptWithKey(targetUrl, key),
    directUrlEncrypted: encryptWithKey(targetDirectUrl, key),
    status: "ACTIVE",
  },
});
console.log(
  "\nOK — tenant movido para projeto dedicado e registro atualizado." +
    "\nBanco antigo preservado (cleanup manual). Redeploy/reinício invalida resolvers em cache.",
);
process.exit(0);
