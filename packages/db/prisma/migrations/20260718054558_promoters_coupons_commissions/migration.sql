-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "CommissionBase" AS ENUM ('NOMINAL', 'AFTER_DISCOUNT');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "AttributionMechanism" AS ENUM ('NONE', 'LINK', 'COUPON');

-- CreateEnum
CREATE TYPE "CommissionEntryType" AS ENUM ('ACCRUAL', 'REVERSAL');

-- CreateTable
CREATE TABLE "PromoterAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoterAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoterLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoterLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "membershipId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "membershipId" TEXT,
    "ticketTypeId" TEXT,
    "type" "CommissionType" NOT NULL,
    "value" INTEGER NOT NULL,
    "base" "CommissionBase" NOT NULL DEFAULT 'NOMINAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAttribution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "mechanism" "AttributionMechanism" NOT NULL DEFAULT 'NONE',
    "membershipId" TEXT,
    "couponId" TEXT,
    "linkId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "CommissionEntryType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "baseCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "ruleSnapshot" JSONB NOT NULL,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromoterAssignment_organizationId_eventId_idx" ON "PromoterAssignment"("organizationId", "eventId");

-- CreateIndex
CREATE INDEX "PromoterAssignment_membershipId_idx" ON "PromoterAssignment"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoterAssignment_eventId_membershipId_key" ON "PromoterAssignment"("eventId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoterLink_code_key" ON "PromoterLink"("code");

-- CreateIndex
CREATE INDEX "PromoterLink_organizationId_eventId_idx" ON "PromoterLink"("organizationId", "eventId");

-- CreateIndex
CREATE INDEX "PromoterLink_membershipId_idx" ON "PromoterLink"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoterLink_eventId_membershipId_key" ON "PromoterLink"("eventId", "membershipId");

-- CreateIndex
CREATE INDEX "Coupon_organizationId_eventId_idx" ON "Coupon"("organizationId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_eventId_code_key" ON "Coupon"("eventId", "code");

-- CreateIndex
CREATE INDEX "CommissionRule_organizationId_eventId_active_idx" ON "CommissionRule"("organizationId", "eventId", "active");

-- CreateIndex
CREATE INDEX "CommissionRule_eventId_membershipId_active_idx" ON "CommissionRule"("eventId", "membershipId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAttribution_orderId_key" ON "OrderAttribution"("orderId");

-- CreateIndex
CREATE INDEX "OrderAttribution_organizationId_eventId_idx" ON "OrderAttribution"("organizationId", "eventId");

-- CreateIndex
CREATE INDEX "OrderAttribution_membershipId_idx" ON "OrderAttribution"("membershipId");

-- CreateIndex
CREATE INDEX "CommissionEntry_organizationId_eventId_membershipId_idx" ON "CommissionEntry"("organizationId", "eventId", "membershipId");

-- CreateIndex
CREATE INDEX "CommissionEntry_membershipId_createdAt_idx" ON "CommissionEntry"("membershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionEntry_orderId_type_key" ON "CommissionEntry"("orderId", "type");
