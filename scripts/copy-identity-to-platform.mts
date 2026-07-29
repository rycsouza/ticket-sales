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
  const rows = (await legacy.query(`SELECT * FROM "${table}"`)) as Record<string, unknown>[];
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
  const result = await delegate.createMany({ data: rows, skipDuplicates: true });
  console.log(`${table}: ${rows.length} lida(s), ${result.count} inserida(s) (duplicadas puladas)`);
}
if (!commit) console.log("\nDRY-RUN — repita com --commit para copiar.");
process.exit(0);
