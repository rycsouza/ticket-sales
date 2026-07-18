-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "anonymizedAt" TIMESTAMP(3),
ADD COLUMN     "lastPurchaseAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Customer_anonymizedAt_lastPurchaseAt_idx" ON "Customer"("anonymizedAt", "lastPurchaseAt");
