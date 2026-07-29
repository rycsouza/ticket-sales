/**
 * Fan-out de migrations (docs/MULTITENANT.md §7): aplica `prisma migrate
 * deploy` no banco de CADA tenant registrado (ACTIVE/PROVISIONING), com dedupe
 * por URL (tenants legados compartilhando um banco migram uma vez só).
 *
 *   npx tsx scripts/migrate-tenants.mts [--commit]
 *
 * DRY-RUN por padrão: lista o plano sem tocar nos bancos. Falha parcial não
 * derruba o restante — o relatório final mostra tenant a tenant. Nunca ecoa
 * URLs/segredos.
 */
import { config as loadDotenv } from "dotenv";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decryptWithKey } from "../packages/db/src/encryption.js";
import { getPlatformPrisma } from "../packages/db/src/platform.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv({ path: path.join(ROOT, ".env") });

const platformUrl = process.env.PLATFORM_DATABASE_URL;
const key = process.env.ENCRYPTION_KEY_PLATFORM_DB;
if (!platformUrl || !key) {
  console.error("PLATFORM_DATABASE_URL e ENCRYPTION_KEY_PLATFORM_DB são obrigatórios");
  process.exit(1);
}
const commit = process.argv.includes("--commit");
const platform = getPlatformPrisma(platformUrl);

const tenants = await platform.tenant.findMany({
  where: { status: { in: ["ACTIVE", "PROVISIONING"] } },
  orderBy: { slug: "asc" },
});

// Dedupe por banco físico (hash da URL — a URL em si nunca é exibida).
const byUrl = new Map<string, { urls: { url: string; direct: string }; slugs: string[] }>();
for (const tenant of tenants) {
  const url = decryptWithKey(tenant.databaseUrlEncrypted, key);
  const direct = tenant.directUrlEncrypted ? decryptWithKey(tenant.directUrlEncrypted, key) : url;
  const fingerprint = createHash("sha256").update(direct).digest("hex").slice(0, 12);
  const entry = byUrl.get(fingerprint) ?? { urls: { url, direct }, slugs: [] };
  entry.slugs.push(tenant.slug);
  byUrl.set(fingerprint, entry);
}

console.log(`${tenants.length} tenant(s) → ${byUrl.size} banco(s) físico(s)\n`);
let failed = 0;
for (const [fingerprint, { urls, slugs }] of byUrl) {
  console.log(`db ${fingerprint} (${slugs.join(", ")}): migrate deploy${commit ? "" : " (dry-run)"}`);
  if (!commit) continue;
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: path.join(ROOT, "packages/db"),
    env: {
      ...process.env,
      DATABASE_URL: urls.url,
      DIRECT_URL: urls.direct,
      DOTENV_CONFIG_QUIET: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failed += 1;
    const tail = `${result.stdout}\n${result.stderr}`.split("\n").slice(-8).join("\n");
    console.error(`  FALHOU:\n${tail}`);
  } else {
    const summary = result.stdout.split("\n").filter((l) => l.trim()).slice(-1)[0] ?? "ok";
    console.log(`  ${summary}`);
  }
}
if (!commit) console.log("\nDRY-RUN — repita com --commit para aplicar.");
process.exit(failed > 0 ? 1 : 0);
