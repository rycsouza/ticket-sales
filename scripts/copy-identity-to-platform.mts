/**
 * MT-2 — copia a identidade global do banco único legado para o PLATFORM DB
 * (User, Organization, TrustedDevice, Session, Membership, Invite,
 * PaymentEvent). Idempotente: createMany com skipDuplicates.
 *
 *   npx tsx scripts/copy-identity-to-platform.mts [--commit]
 */
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { getPlatformPrisma } from "../packages/db/src/platform.js";

loadDotenv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

/**
 * Timestamps: as colunas são `timestamp` SEM fuso (convenção do projeto: valor
 * = hora UTC). O driver HTTP do Neon devolve string naive e o parse aplicaria
 * o fuso LOCAL, deslocando tudo (+4h em -04). Serializar como ISO-UTC no SQL
 * elimina a ambiguidade na origem.
 */
async function selectAllIsoUtc(
  db: ReturnType<typeof neon>,
  table: string,
  where = "",
  params: unknown[] = [],
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
  return (await db.query(`SELECT ${list} FROM "${table}" ${where}`, params)) as Record<string, unknown>[];
}

const legacyUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const platformUrl = process.env.PLATFORM_DATABASE_URL;
if (!legacyUrl || !platformUrl) {
  console.error("DATABASE_URL/DIRECT_URL e PLATFORM_DATABASE_URL são obrigatórios");
  process.exit(1);
}
const commit = process.argv.includes("--commit");
const legacy = neon(legacyUrl);
const platform = getPlatformPrisma(platformUrl);

// FK order: users/orgs primeiro, depois dependentes.
const TABLES = [
  { table: "User", model: "user" },
  { table: "Organization", model: "organization" },
  { table: "TrustedDevice", model: "trustedDevice" },
  { table: "Session", model: "session" },
  { table: "Membership", model: "membership" },
  { table: "Invite", model: "invite" },
  { table: "PaymentEvent", model: "paymentEvent" },
] as const;

for (const { table, model } of TABLES) {
  const rows = await selectAllIsoUtc(legacy, table);
  if (!commit) {
    console.log(`${table}: ${rows.length} linha(s) a copiar (dry-run)`);
    continue;
  }
  if (rows.length === 0) {
    console.log(`${table}: 0 linhas`);
    continue;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (platform as any)[model];
  // Upsert por linha: idempotente E corretivo (re-run conserta timestamps
  // deslocados por execuções anteriores).
  for (const row of rows) {
    const { id, ...rest } = row as { id: string } & Record<string, unknown>;
    await delegate.upsert({ where: { id }, create: { id, ...rest }, update: rest });
  }
  console.log(`${table}: ${rows.length} upsert(s)`);
}
if (!commit) console.log("\nDRY-RUN — repita com --commit para copiar.");
process.exit(0);
