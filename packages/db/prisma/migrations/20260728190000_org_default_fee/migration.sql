-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "defaultFeeMode" "FeeMode" NOT NULL DEFAULT 'PRODUCER',
ADD COLUMN     "defaultPlatformFeeBps" INTEGER NOT NULL DEFAULT 0;
