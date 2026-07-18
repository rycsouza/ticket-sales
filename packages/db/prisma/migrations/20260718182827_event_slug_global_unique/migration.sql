-- Public event URL moved to /evento/<slug>: slug is now globally unique.
-- DropIndex (per-organization uniqueness)
DROP INDEX "Event_organizationId_slug_key";

-- CreateIndex (global uniqueness)
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");
