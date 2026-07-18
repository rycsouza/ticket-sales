import { defineConfig, env } from "prisma/config";
import { config as loadDotenv } from "dotenv";
import path from "node:path";

// Load the repository-root .env (secrets never live in the repo itself —
// .env is gitignored; see .env.example for the expected variables).
loadDotenv({ path: path.resolve(import.meta.dirname, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Neon pooled URL (runtime)
    url: env("DATABASE_URL"),
    // Neon direct URL — migrations only
    directUrl: env("DIRECT_URL"),
  },
});
