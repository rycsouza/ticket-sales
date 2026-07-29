import { defineConfig } from "prisma/config";
import { config as loadDotenv } from "dotenv";
import path from "node:path";

// Platform DB (docs/MULTITENANT.md §2.1) — separate migration trail from the
// tenant/application schema. Invoke the CLI with `--config prisma-platform.config.ts`.
loadDotenv({ path: path.resolve(import.meta.dirname, "../../.env") });

// `prisma generate` loads this config but never connects; environments without
// the platform vars (e.g. Vercel postinstall before MT-5) must not break on
// generate. Migrate/deploy DO need the real URLs — the placeholder host makes
// a missing var fail loudly and obviously there.
const NOT_SET = "postgresql://invalid@platform-db-url-not-set/invalid";

export default defineConfig({
  schema: "prisma/platform/schema.prisma",
  datasource: {
    url: process.env.PLATFORM_DATABASE_URL ?? NOT_SET,
    directUrl: process.env.PLATFORM_DIRECT_URL ?? NOT_SET,
  },
});
