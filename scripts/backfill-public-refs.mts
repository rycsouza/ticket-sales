/**
 * MT-3 — backfill de PublicRef a partir dos dados existentes do(s) tenant(s):
 * slugs/ids de eventos, códigos de pedido, hashes de token de ingresso,
 * tokens de relatório de promoter e ids de transação do PSP.
 * Idempotente (createMany + skipDuplicates).
 *
 *   npx tsx scripts/backfill-public-refs.mts [--commit]
 */
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { getPlatformPrisma } from "../packages/db/src/platform.js";

loadDotenv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

const tenantUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const platformUrl = process.env.PLATFORM_DATABASE_URL;
if (!tenantUrl || !platformUrl) {
  console.error("DATABASE_URL/DIRECT_URL e PLATFORM_DATABASE_URL são obrigatórios");
  process.exit(1);
}
const commit = process.argv.includes("--commit");
const tenant = neon(tenantUrl);
const platform = getPlatformPrisma(platformUrl);

type Row = { kind: string; key: string; organizationId: string };
const SOURCES: { label: string; sql: string }[] = [
  { label: "EVENT_SLUG", sql: `SELECT 'EVENT_SLUG' AS kind, slug AS key, "organizationId" FROM "Event"` },
  { label: "EVENT_ID", sql: `SELECT 'EVENT_ID' AS kind, id AS key, "organizationId" FROM "Event"` },
  { label: "ORDER_CODE", sql: `SELECT 'ORDER_CODE' AS kind, code AS key, "organizationId" FROM "Order"` },
  { label: "TICKET_TOKEN", sql: `SELECT 'TICKET_TOKEN' AS kind, "tokenHash" AS key, "organizationId" FROM "Ticket"` },
  { label: "PROMOTER_REPORT", sql: `SELECT 'PROMOTER_REPORT' AS kind, "reportTokenHash" AS key, "organizationId" FROM "Promoter" WHERE "reportTokenHash" IS NOT NULL` },
  { label: "PROVIDER_TX", sql: `SELECT 'PROVIDER_TX' AS kind, "providerTransactionId" AS key, "organizationId" FROM "Payment" WHERE "providerTransactionId" IS NOT NULL` },
];

for (const { label, sql } of SOURCES) {
  const rows = (await tenant.query(sql)) as Row[];
  if (!commit) {
    console.log(`${label}: ${rows.length} ref(s) a criar (dry-run)`);
    continue;
  }
  if (rows.length === 0) {
    console.log(`${label}: 0`);
    continue;
  }
  const result = await platform.publicRef.createMany({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: rows.map((r) => ({ kind: r.kind as any, key: r.key, organizationId: r.organizationId })),
    skipDuplicates: true,
  });
  console.log(`${label}: ${rows.length} lida(s), ${result.count} inserida(s)`);
}
if (!commit) console.log("\nDRY-RUN — repita com --commit.");
process.exit(0);
