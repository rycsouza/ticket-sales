-- Add Organization.slug (globally unique) for the panel URL (/painel/<slug>).
-- Backfilled from the name + a short id suffix so existing rows stay unique and
-- readable; the column is only made NOT NULL/UNIQUE after the backfill.

-- 1) Add nullable first so existing rows are not rejected.
ALTER TABLE "Organization" ADD COLUMN "slug" TEXT;

-- 2) Backfill: slugified name + 6 hex chars of the id (guarantees uniqueness,
--    keeps it readable). Empty/edge names fall back to "org".
UPDATE "Organization"
SET "slug" =
  COALESCE(
    NULLIF(trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')), ''),
    'org'
  )
  || '-' || substr(replace("id", '-', ''), 1, 6)
WHERE "slug" IS NULL;

-- 3) Enforce the invariants now that every row has a value.
ALTER TABLE "Organization" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
