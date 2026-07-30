-- Org-level defaults: IANA timezone (new events inherit it) and business
-- niche (drives product vocabulary). Additive only — no data rewrite.

-- CreateEnum
CREATE TYPE "OrgNiche" AS ENUM ('EVENTOS', 'VIAGENS');

-- AlterTable
ALTER TABLE "Organization"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN "niche" "OrgNiche" NOT NULL DEFAULT 'EVENTOS';
