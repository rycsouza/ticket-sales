-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "addressComplement" TEXT,
ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "postalCode" TEXT;
