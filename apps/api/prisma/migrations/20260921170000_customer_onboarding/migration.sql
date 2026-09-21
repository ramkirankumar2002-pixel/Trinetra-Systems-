-- CreateEnum
CREATE TYPE "OnboardingSessionStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'READY_FOR_VALIDATION', 'COMPLETED', 'BLOCKED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Organization" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN "defaultLanguage" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Organization" ADD COLUMN "enabledDriverLanguages" TEXT[] DEFAULT ARRAY['en', 'hi', 'te']::TEXT[];
ALTER TABLE "Organization" ADD COLUMN "driverVoiceEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "driverAudioEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "documentTypeCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Site" ADD COLUMN "location" TEXT;

-- AlterTable
ALTER TABLE "Weighbridge" ADD COLUMN "capacityKg" DECIMAL(12,3);

-- CreateTable
CREATE TABLE "OnboardingSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL,
    "status" "OnboardingSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "completionPercent" INTEGER NOT NULL DEFAULT 0,
    "completedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "settings" JSONB,
    "lastValidation" JSONB,
    "lastReadiness" JSONB,
    "lastHardwareCheck" JSONB,
    "acceptedWarningKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingSession_organizationId_status_idx" ON "OnboardingSession"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OnboardingSession_siteId_idx" ON "OnboardingSession"("siteId");

-- CreateIndex
CREATE INDEX "OnboardingSession_createdByUserId_idx" ON "OnboardingSession"("createdByUserId");

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
