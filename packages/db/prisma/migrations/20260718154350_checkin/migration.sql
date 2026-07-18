-- CreateEnum
CREATE TYPE "CheckinMode" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateTable
CREATE TABLE "CheckinAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "sectorId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckinAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkin" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "operatorMembershipId" TEXT NOT NULL,
    "deviceId" TEXT,
    "mode" "CheckinMode" NOT NULL DEFAULT 'ONLINE',
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "justification" TEXT,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checkin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckinAssignment_organizationId_eventId_idx" ON "CheckinAssignment"("organizationId", "eventId");

-- CreateIndex
CREATE INDEX "CheckinAssignment_membershipId_idx" ON "CheckinAssignment"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckinAssignment_eventId_membershipId_key" ON "CheckinAssignment"("eventId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Checkin_ticketId_key" ON "Checkin"("ticketId");

-- CreateIndex
CREATE INDEX "Checkin_organizationId_eventId_idx" ON "Checkin"("organizationId", "eventId");
