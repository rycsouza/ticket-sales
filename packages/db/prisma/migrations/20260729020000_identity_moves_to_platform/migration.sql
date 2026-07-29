-- MT-2 (docs/MULTITENANT.md): identity moves to the PLATFORM DB.
-- Data was copied to the platform DB BEFORE this migration
-- (scripts/copy-identity-to-platform.mts). organizationId columns on business
-- tables remain as SOFT references (no FK) -- the owner is resolved by the
-- control plane.
-- NOTE: the out-of-band "LandingPage" table (feat/personalizacao-pagina-venda
-- work on the shared dev DB) was intentionally EXCLUDED from the generated
-- drop list -- it does not belong to this schema.

-- DropForeignKey
ALTER TABLE "AuditEvent" DROP CONSTRAINT IF EXISTS "AuditEvent_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Invite" DROP CONSTRAINT IF EXISTS "Invite_acceptedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Invite" DROP CONSTRAINT IF EXISTS "Invite_invitedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Invite" DROP CONSTRAINT IF EXISTS "Invite_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT IF EXISTS "Membership_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT IF EXISTS "Membership_userId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "TrustedDevice" DROP CONSTRAINT IF EXISTS "TrustedDevice_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "Invite";

-- DropTable
DROP TABLE IF EXISTS "Membership";

-- DropTable
DROP TABLE IF EXISTS "Organization";

-- DropTable
DROP TABLE IF EXISTS "PaymentEvent";

-- DropTable
DROP TABLE IF EXISTS "Session";

-- DropTable
DROP TABLE IF EXISTS "TrustedDevice";

-- DropTable
DROP TABLE IF EXISTS "User";

-- DropEnum
DROP TYPE IF EXISTS "InviteStatus";

-- DropEnum
DROP TYPE IF EXISTS "MembershipRole";

-- DropEnum
DROP TYPE IF EXISTS "MembershipStatus";

-- DropEnum
DROP TYPE IF EXISTS "OrganizationStatus";

-- DropEnum
DROP TYPE IF EXISTS "PaymentEventStatus";

-- DropEnum
DROP TYPE IF EXISTS "UserStatus";
