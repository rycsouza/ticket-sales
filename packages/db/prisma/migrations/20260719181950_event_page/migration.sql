-- CreateTable
CREATE TABLE "EventPage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "brandColor" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "faviconUrl" TEXT,
    "blocks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventPage_eventId_key" ON "EventPage"("eventId");

-- CreateIndex
CREATE INDEX "EventPage_organizationId_idx" ON "EventPage"("organizationId");

-- AddForeignKey
ALTER TABLE "EventPage" ADD CONSTRAINT "EventPage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
