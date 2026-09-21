-- CreateEnum
CREATE TYPE "CameraPurpose" AS ENUM ('ENTRY_ANPR', 'EXIT_ANPR', 'GENERAL_MONITORING');

-- CreateEnum
CREATE TYPE "CameraConnectionType" AS ENUM ('SIMULATOR', 'RTSP', 'HTTP_SNAPSHOT', 'LOCAL');

-- CreateEnum
CREATE TYPE "CameraProviderType" AS ENUM ('SIMULATOR', 'RTSP', 'HTTP_SNAPSHOT', 'LOCAL');

-- CreateEnum
CREATE TYPE "AnprProviderType" AS ENUM ('SIMULATOR');

-- CreateEnum
CREATE TYPE "AnprProviderStatus" AS ENUM ('READY', 'PROCESSING', 'ERROR', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "AnprDetectionLifecycle" AS ENUM ('DETECTED', 'MATCHED', 'NO_MATCH', 'CONFIRMATION_REQUIRED', 'CONFIRMED', 'CORRECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AnprDetectionSource" AS ENUM ('ANPR', 'MANUAL');

-- CreateEnum
CREATE TYPE "AnprConfidenceBand" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'NONE');

-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "weighbridgeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cameraIdentifier" TEXT NOT NULL,
    "purpose" "CameraPurpose" NOT NULL DEFAULT 'ENTRY_ANPR',
    "cameraProviderType" "CameraProviderType" NOT NULL DEFAULT 'SIMULATOR',
    "connectionType" "CameraConnectionType" NOT NULL DEFAULT 'SIMULATOR',
    "anprProviderType" "AnprProviderType" NOT NULL DEFAULT 'SIMULATOR',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "direction" TEXT,
    "snapshotUrl" TEXT,
    "streamUrl" TEXT,
    "highConfidenceMin" DECIMAL(4,3) NOT NULL DEFAULT 0.900,
    "mediumConfidenceMin" DECIMAL(4,3) NOT NULL DEFAULT 0.700,
    "simulatorScenario" TEXT NOT NULL DEFAULT 'HIGH_KNOWN',
    "lastStatus" "HardwareDeviceStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastAnprStatus" "AnprProviderStatus" NOT NULL DEFAULT 'UNAVAILABLE',
    "lastFrameAt" TIMESTAMP(3),
    "lastCommunicationAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastFrameStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnprDetection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "weighbridgeId" TEXT NOT NULL,
    "transactionId" TEXT,
    "rawPlate" TEXT,
    "normalizedPlate" TEXT,
    "displayPlate" TEXT,
    "confidence" DECIMAL(6,4),
    "confidenceBand" "AnprConfidenceBand" NOT NULL,
    "provider" TEXT NOT NULL,
    "source" "AnprDetectionSource" NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "lifecycle" "AnprDetectionLifecycle" NOT NULL DEFAULT 'DETECTED',
    "imageStorageKey" TEXT,
    "countryRegion" TEXT,
    "boundingBox" JSONB,
    "candidates" JSONB NOT NULL,
    "processingDurationMs" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "selectedCandidatePlate" TEXT,
    "correctedPlate" TEXT,
    "correctionReason" TEXT,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "vehicleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnprDetection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleIdentificationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "cameraId" TEXT,
    "weighbridgeId" TEXT NOT NULL,
    "transactionId" TEXT,
    "detectionId" TEXT,
    "source" "AnprDetectionSource" NOT NULL,
    "outcome" TEXT NOT NULL,
    "rawPlate" TEXT,
    "normalizedPlate" TEXT NOT NULL,
    "vehicleId" TEXT,
    "reason" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleIdentificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Camera_weighbridgeId_cameraIdentifier_key" ON "Camera"("weighbridgeId", "cameraIdentifier");

-- CreateIndex
CREATE INDEX "Camera_organizationId_siteId_idx" ON "Camera"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "Camera_enabled_lastStatus_idx" ON "Camera"("enabled", "lastStatus");

-- CreateIndex
CREATE INDEX "AnprDetection_organizationId_siteId_capturedAt_idx" ON "AnprDetection"("organizationId", "siteId", "capturedAt");

-- CreateIndex
CREATE INDEX "AnprDetection_cameraId_capturedAt_idx" ON "AnprDetection"("cameraId", "capturedAt");

-- CreateIndex
CREATE INDEX "AnprDetection_transactionId_idx" ON "AnprDetection"("transactionId");

-- CreateIndex
CREATE INDEX "AnprDetection_normalizedPlate_idx" ON "AnprDetection"("normalizedPlate");

-- CreateIndex
CREATE INDEX "AnprDetection_confirmedByUserId_idx" ON "AnprDetection"("confirmedByUserId");

-- CreateIndex
CREATE INDEX "VehicleIdentificationEvent_organizationId_siteId_createdAt_idx" ON "VehicleIdentificationEvent"("organizationId", "siteId", "createdAt");

-- CreateIndex
CREATE INDEX "VehicleIdentificationEvent_transactionId_idx" ON "VehicleIdentificationEvent"("transactionId");

-- CreateIndex
CREATE INDEX "VehicleIdentificationEvent_detectionId_idx" ON "VehicleIdentificationEvent"("detectionId");

-- CreateIndex
CREATE INDEX "VehicleIdentificationEvent_actorUserId_idx" ON "VehicleIdentificationEvent"("actorUserId");

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_weighbridgeId_fkey" FOREIGN KEY ("weighbridgeId") REFERENCES "Weighbridge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnprDetection" ADD CONSTRAINT "AnprDetection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnprDetection" ADD CONSTRAINT "AnprDetection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnprDetection" ADD CONSTRAINT "AnprDetection_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnprDetection" ADD CONSTRAINT "AnprDetection_weighbridgeId_fkey" FOREIGN KEY ("weighbridgeId") REFERENCES "Weighbridge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnprDetection" ADD CONSTRAINT "AnprDetection_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnprDetection" ADD CONSTRAINT "AnprDetection_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnprDetection" ADD CONSTRAINT "AnprDetection_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleIdentificationEvent" ADD CONSTRAINT "VehicleIdentificationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleIdentificationEvent" ADD CONSTRAINT "VehicleIdentificationEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleIdentificationEvent" ADD CONSTRAINT "VehicleIdentificationEvent_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleIdentificationEvent" ADD CONSTRAINT "VehicleIdentificationEvent_weighbridgeId_fkey" FOREIGN KEY ("weighbridgeId") REFERENCES "Weighbridge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleIdentificationEvent" ADD CONSTRAINT "VehicleIdentificationEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleIdentificationEvent" ADD CONSTRAINT "VehicleIdentificationEvent_detectionId_fkey" FOREIGN KEY ("detectionId") REFERENCES "AnprDetection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleIdentificationEvent" ADD CONSTRAINT "VehicleIdentificationEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleIdentificationEvent" ADD CONSTRAINT "VehicleIdentificationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
