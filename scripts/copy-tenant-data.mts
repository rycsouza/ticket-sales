/**
 * MT-5 — copia os dados de NEGÓCIO de uma org do banco único legado para o
 * banco dedicado do tenant, em ordem segura de FK, e valida contagens.
 * Idempotente (createMany + skipDuplicates).
 *
 *   npx tsx scripts/copy-tenant-data.mts --org <org-uuid> [--commit]
 *
 * A URL de destino vem do REGISTRO do tenant (decifrada) — o tenant precisa
 * estar provisionado/registrado antes (scripts/provision-tenant.mts).
 */
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { decryptWithKey } from "../packages/db/src/encryption.js";
import { getPrisma } from "../packages/db/src/index.js";
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

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const organizationId = arg("org");
const commit = process.argv.includes("--commit");

const legacyUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const platformUrl = process.env.PLATFORM_DATABASE_URL;
const key = process.env.ENCRYPTION_KEY_PLATFORM_DB;
if (!organizationId || !legacyUrl || !platformUrl || !key) {
  console.error("uso: --org <uuid> (+ DATABASE_URL/PLATFORM_DATABASE_URL/ENCRYPTION_KEY_PLATFORM_DB no .env)");
  process.exit(1);
}

const platform = getPlatformPrisma(platformUrl);
const tenantRow = await platform.tenant.findUnique({ where: { id: organizationId } });
if (!tenantRow) {
  console.error("tenant não registrado — rode provision-tenant.mts antes");
  process.exit(1);
}
const targetUrl = decryptWithKey(tenantRow.databaseUrlEncrypted, key);
const legacy = neon(legacyUrl);
const target = getPrisma(targetUrl);

// Ordem segura de FK dentro do banco do tenant (pais antes de filhos).
const TABLES: { table: string; model: string }[] = [
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
];

let mismatches = 0;
for (const { table, model } of TABLES) {
  const rows = await selectAllIsoUtc(legacy, table, `WHERE "organizationId" = $1`, [
    organizationId,
  ]);
  if (!commit) {
    if (rows.length > 0) console.log(`${table}: ${rows.length} linha(s) a copiar (dry-run)`);
    continue;
  }
  if (rows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (target as any)[model];
    // Upsert por linha: idempotente E corretivo (re-run conserta cópias com
    // timestamps deslocados de execuções anteriores).
    for (const row of rows) {
      const { id, ...rest } = row as { id: string } & Record<string, unknown>;
      await delegate.upsert({ where: { id }, create: { id, ...rest }, update: rest });
    }
  }
  // Validação: contagem no destino ≥ origem (skipDuplicates torna re-runs seguros)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targetCount = await (target as any)[model].count({ where: { organizationId } });
  const ok = targetCount >= rows.length;
  if (!ok) mismatches += 1;
  if (rows.length > 0 || targetCount > 0) {
    console.log(`${table}: origem=${rows.length} destino=${targetCount} ${ok ? "OK" : "DIVERGENTE"}`);
  }
}
if (!commit) console.log("\nDRY-RUN — repita com --commit.");
else if (mismatches > 0) {
  console.error(`\n${mismatches} tabela(s) DIVERGENTE(s) — NÃO corte o tenant.`);
  process.exit(1);
} else console.log("\nOK — cópia validada (destino ≥ origem em todas as tabelas).");
process.exit(0);
