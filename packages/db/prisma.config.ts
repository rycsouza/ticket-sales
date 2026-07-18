import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Neon pooled URL (runtime)
    url: env("DATABASE_URL"),
    // Neon direct URL — migrations only
    directUrl: env("DIRECT_URL"),
  },
});
