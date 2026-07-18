-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('PRODUCER', 'PLATFORM', 'PROMOTER');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('SALE', 'FEE', 'PSP_COST', 'COMMISSION', 'REFUND', 'PAYOUT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "orderId" TEXT,
    "account" "LedgerAccount" NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "membershipId" TEXT,
    "memo" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerEntry_organizationId_eventId_idx" ON "LedgerEntry"("organizationId", "eventId");

-- CreateIndex
CREATE INDEX "LedgerEntry_organizationId_account_idx" ON "LedgerEntry"("organizationId", "account");

-- CreateIndex
CREATE INDEX "LedgerEntry_membershipId_idx" ON "LedgerEntry"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_orderId_account_type_key" ON "LedgerEntry"("orderId", "account", "type");
