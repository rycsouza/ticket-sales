-- Vitrine pública por produtora (/<org-slug>), configurada no painel.
-- Additive only.

-- CreateTable
CREATE TABLE "OrgLandingPage" (
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "tagline" TEXT,
    "headline" TEXT,
    "headlineHighlight" TEXT,
    "subheadline" TEXT,
    "heroImageUrl" TEXT,
    "logoUrl" TEXT,
    "whatsapp" TEXT,
    "instagram" TEXT,
    "trustItems" JSONB,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "footerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgLandingPage_pkey" PRIMARY KEY ("organizationId")
);

-- AddForeignKey
ALTER TABLE "OrgLandingPage" ADD CONSTRAINT "OrgLandingPage_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
