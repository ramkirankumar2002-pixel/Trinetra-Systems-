-- CreateEnum
CREATE TYPE "EdgeGatewayStatus" AS ENUM ('PENDING', 'ONLINE', 'OFFLINE', 'DISABLED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EdgeDeviceType" AS ENUM ('WEIGHBRIDGE_INDICATOR', 'CAMERA', 'SCANNER', 'BARCODE_SCANNER', 'SENSOR', 'PLC', 'OTHER');

-- CreateEnum
CREATE TYPE "EdgeEventType" AS ENUM ('DEVICE_WEIGHT_READING', 'DEVICE_ANPR_DETECTION', 'DEVICE_STATUS_CHANGED', 'DEVICE_SCAN_COMPLETED');

-- CreateEnum
CREATE TYPE "EdgeIngestStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'REJECTED');

-- CreateTable
CREATE TABLE "EdgeGateway" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EdgeGatewayStatus" NOT NULL DEFAULT 'PENDING',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "credentialHash" TEXT NOT NULL,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastCommunicationAt" TIMESTAMP(3),
    "softwareVersion" TEXT,
    "buildEnvironment" TEXT,
    "platform" TEXT,
    "connectedDeviceCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EdgeDevice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "deviceType" "EdgeDeviceType" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "protocol" TEXT,
    "connectionType" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'SIMULATOR',
    "weighbridgeId" TEXT,
    "cameraId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "HardwareDeviceStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastCommunicationAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastReadingSummary" JSONB,
    "configurationRef" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EdgeIngestedEvent" (
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventType" "EdgeEventType" NOT NULL,
    "deviceEventTime" TIMESTAMP(3) NOT NULL,
    "gatewayReceiveTime" TIMESTAMP(3) NOT NULL,
    "backendReceiveTime" TIMESTAMP(3) NOT NULL,
    "sequence" TEXT,
    "softwareVersion" TEXT,
    "payload" JSONB NOT NULL,
    "status" "EdgeIngestStatus" NOT NULL DEFAULT 'RECEIVED',
    "weighmentId" TEXT,
    "anprDetectionId" TEXT,
    "documentId" TEXT,
    "resultSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeIngestedEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "EdgeGateway_organizationId_code_key" ON "EdgeGateway"("organizationId", "code");

-- CreateIndex
CREATE INDEX "EdgeGateway_organizationId_siteId_idx" ON "EdgeGateway"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "EdgeGateway_status_lastHeartbeatAt_idx" ON "EdgeGateway"("status", "lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "EdgeGateway_registeredByUserId_idx" ON "EdgeGateway"("registeredByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EdgeDevice_gatewayId_code_key" ON "EdgeDevice"("gatewayId", "code");

-- CreateIndex
CREATE INDEX "EdgeDevice_organizationId_siteId_idx" ON "EdgeDevice"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "EdgeDevice_weighbridgeId_idx" ON "EdgeDevice"("weighbridgeId");

-- CreateIndex
CREATE INDEX "EdgeDevice_cameraId_idx" ON "EdgeDevice"("cameraId");

-- CreateIndex
CREATE INDEX "EdgeDevice_enabled_status_idx" ON "EdgeDevice"("enabled", "status");

-- CreateIndex
CREATE INDEX "EdgeIngestedEvent_organizationId_createdAt_idx" ON "EdgeIngestedEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "EdgeIngestedEvent_gatewayId_createdAt_idx" ON "EdgeIngestedEvent"("gatewayId", "createdAt");

-- CreateIndex
CREATE INDEX "EdgeIngestedEvent_deviceId_createdAt_idx" ON "EdgeIngestedEvent"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "EdgeIngestedEvent_weighmentId_idx" ON "EdgeIngestedEvent"("weighmentId");

-- CreateIndex
CREATE INDEX "EdgeIngestedEvent_anprDetectionId_idx" ON "EdgeIngestedEvent"("anprDetectionId");

-- CreateIndex
CREATE INDEX "EdgeIngestedEvent_documentId_idx" ON "EdgeIngestedEvent"("documentId");

-- AddForeignKey
ALTER TABLE "EdgeGateway" ADD CONSTRAINT "EdgeGateway_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeGateway" ADD CONSTRAINT "EdgeGateway_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeGateway" ADD CONSTRAINT "EdgeGateway_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeDevice" ADD CONSTRAINT "EdgeDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeDevice" ADD CONSTRAINT "EdgeDevice_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeDevice" ADD CONSTRAINT "EdgeDevice_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "EdgeGateway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeDevice" ADD CONSTRAINT "EdgeDevice_weighbridgeId_fkey" FOREIGN KEY ("weighbridgeId") REFERENCES "Weighbridge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeDevice" ADD CONSTRAINT "EdgeDevice_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeIngestedEvent" ADD CONSTRAINT "EdgeIngestedEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeIngestedEvent" ADD CONSTRAINT "EdgeIngestedEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeIngestedEvent" ADD CONSTRAINT "EdgeIngestedEvent_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "EdgeGateway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeIngestedEvent" ADD CONSTRAINT "EdgeIngestedEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "EdgeDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
