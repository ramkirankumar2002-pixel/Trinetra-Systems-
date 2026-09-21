-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('DEMO', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Organization" ADD COLUMN "kind" "OrganizationKind" NOT NULL DEFAULT 'CUSTOMER';

-- AlterTable
ALTER TABLE "Site" ADD COLUMN "status" "SiteStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "UserRole" ADD COLUMN "weighbridgeId" TEXT;

-- CreateIndex
CREATE INDEX "Site_organizationId_status_idx" ON "Site"("organizationId", "status");

-- CreateIndex
CREATE INDEX "UserRole_weighbridgeId_idx" ON "UserRole"("weighbridgeId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_weighbridgeId_fkey" FOREIGN KEY ("weighbridgeId") REFERENCES "Weighbridge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
