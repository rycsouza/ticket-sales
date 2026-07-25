-- Affiliate epic: first-class org-level Promoter; repoint membershipId -> promoterId;
-- org-default coupons/commission rules (nullable eventId).
-- All promoter-scoped tables were empty at authoring time -> no backfill needed.

-- 1) First-class Promoter entity (org-level; optional login link; tokenized report)
CREATE TABLE "Promoter" (
  "id"              TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "contactEmail"    TEXT,
  "contactPhone"    TEXT,
  "membershipId"    TEXT,
  "reportTokenHash" TEXT NOT NULL,
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Promoter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Promoter_membershipId_key"    ON "Promoter"("membershipId");
CREATE UNIQUE INDEX "Promoter_reportTokenHash_key" ON "Promoter"("reportTokenHash");
CREATE INDEX "Promoter_organizationId_idx"         ON "Promoter"("organizationId");
CREATE INDEX "Promoter_organizationId_active_idx"  ON "Promoter"("organizationId", "active");

-- 2) PromoterAssignment: membershipId -> promoterId (NOT NULL)
DROP INDEX "PromoterAssignment_eventId_membershipId_key";
DROP INDEX "PromoterAssignment_membershipId_idx";
ALTER TABLE "PromoterAssignment" DROP COLUMN "membershipId";
ALTER TABLE "PromoterAssignment" ADD COLUMN "promoterId" TEXT NOT NULL;
CREATE UNIQUE INDEX "PromoterAssignment_eventId_promoterId_key" ON "PromoterAssignment"("eventId", "promoterId");
CREATE INDEX "PromoterAssignment_promoterId_idx" ON "PromoterAssignment"("promoterId");

-- 3) PromoterLink: membershipId -> promoterId (NOT NULL)
DROP INDEX "PromoterLink_eventId_membershipId_key";
DROP INDEX "PromoterLink_membershipId_idx";
ALTER TABLE "PromoterLink" DROP COLUMN "membershipId";
ALTER TABLE "PromoterLink" ADD COLUMN "promoterId" TEXT NOT NULL;
CREATE UNIQUE INDEX "PromoterLink_eventId_promoterId_key" ON "PromoterLink"("eventId", "promoterId");
CREATE INDEX "PromoterLink_promoterId_idx" ON "PromoterLink"("promoterId");

-- 4) Coupon: membershipId -> promoterId (nullable); eventId nullable (null = org default)
ALTER TABLE "Coupon" DROP COLUMN "membershipId";
ALTER TABLE "Coupon" ADD COLUMN "promoterId" TEXT;
ALTER TABLE "Coupon" ALTER COLUMN "eventId" DROP NOT NULL;
CREATE UNIQUE INDEX "Coupon_org_code_orgdefault_key" ON "Coupon"("organizationId", "code") WHERE "eventId" IS NULL;
CREATE INDEX "Coupon_promoterId_idx" ON "Coupon"("promoterId");

-- 5) CommissionRule: membershipId -> promoterId (nullable); eventId nullable (null = org default)
DROP INDEX "CommissionRule_organizationId_eventId_active_idx";
DROP INDEX "CommissionRule_eventId_membershipId_active_idx";
ALTER TABLE "CommissionRule" DROP COLUMN "membershipId";
ALTER TABLE "CommissionRule" ADD COLUMN "promoterId" TEXT;
ALTER TABLE "CommissionRule" ALTER COLUMN "eventId" DROP NOT NULL;
CREATE INDEX "CommissionRule_organizationId_eventId_active_idx" ON "CommissionRule"("organizationId", "eventId", "active");
CREATE INDEX "CommissionRule_organizationId_promoterId_active_idx" ON "CommissionRule"("organizationId", "promoterId", "active");
CREATE INDEX "CommissionRule_eventId_promoterId_active_idx" ON "CommissionRule"("eventId", "promoterId", "active");

-- 6) OrderAttribution: membershipId -> promoterId (nullable)
DROP INDEX "OrderAttribution_membershipId_idx";
ALTER TABLE "OrderAttribution" DROP COLUMN "membershipId";
ALTER TABLE "OrderAttribution" ADD COLUMN "promoterId" TEXT;
CREATE INDEX "OrderAttribution_promoterId_idx" ON "OrderAttribution"("promoterId");

-- 7) CommissionEntry: membershipId -> promoterId (NOT NULL)
DROP INDEX "CommissionEntry_organizationId_eventId_membershipId_idx";
DROP INDEX "CommissionEntry_membershipId_createdAt_idx";
ALTER TABLE "CommissionEntry" DROP COLUMN "membershipId";
ALTER TABLE "CommissionEntry" ADD COLUMN "promoterId" TEXT NOT NULL;
CREATE INDEX "CommissionEntry_organizationId_eventId_promoterId_idx" ON "CommissionEntry"("organizationId", "eventId", "promoterId");
CREATE INDEX "CommissionEntry_promoterId_createdAt_idx" ON "CommissionEntry"("promoterId", "createdAt");

-- 8) LedgerEntry: membershipId -> promoterId (nullable; promoter-only column)
DROP INDEX "LedgerEntry_membershipId_idx";
ALTER TABLE "LedgerEntry" DROP COLUMN "membershipId";
ALTER TABLE "LedgerEntry" ADD COLUMN "promoterId" TEXT;
CREATE INDEX "LedgerEntry_promoterId_idx" ON "LedgerEntry"("promoterId");
