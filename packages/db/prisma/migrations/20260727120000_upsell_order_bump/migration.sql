-- CreateEnum
CREATE TYPE "OrderItemKind" AS ENUM ('TICKET', 'PRODUCT');
-- CreateEnum
CREATE TYPE "OfferKind" AS ENUM ('ORDER_BUMP', 'UPSELL');
-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "description" TEXT,
ADD COLUMN     "kind" "OrderItemKind" NOT NULL DEFAULT 'TICKET',
ADD COLUMN     "productId" TEXT,
ALTER COLUMN "batchId" DROP NOT NULL,
ALTER COLUMN "ticketTypeId" DROP NOT NULL;
-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT,
    "kind" "OfferKind" NOT NULL,
    "batchId" TEXT,
    "productId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "priceCentsOverride" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "Product_organizationId_active_idx" ON "Product"("organizationId", "active");
-- CreateIndex
CREATE INDEX "Offer_organizationId_active_idx" ON "Offer"("organizationId", "active");
-- CreateIndex
CREATE INDEX "Offer_eventId_kind_active_idx" ON "Offer"("eventId", "kind", "active");
-- CreateIndex
CREATE INDEX "Offer_batchId_idx" ON "Offer"("batchId");
-- CreateIndex
CREATE INDEX "Offer_productId_idx" ON "Offer"("productId");
