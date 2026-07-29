/**
 * Cifra uma connection string com a chave da plataforma (docs/MULTITENANT.md §7).
 *
 *   npx tsx scripts/encrypt-db-url.mts "postgresql://…"
 *
 * Lê ENCRYPTION_KEY_PLATFORM_DB do ambiente/.env. Imprime SÓ o ciphertext —
 * nunca ecoa a URL nem a chave.
 */
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encryptWithKey } from "../packages/db/src/encryption.js";

loadDotenv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

const url = process.argv[2];
const key = process.env.ENCRYPTION_KEY_PLATFORM_DB;

if (!url) {
  console.error("uso: npx tsx scripts/encrypt-db-url.mts <connection-string>");
  process.exit(1);
}
if (!key) {
  console.error("ENCRYPTION_KEY_PLATFORM_DB ausente no ambiente/.env");
  process.exit(1);
}

console.log(encryptWithKey(url, key));
