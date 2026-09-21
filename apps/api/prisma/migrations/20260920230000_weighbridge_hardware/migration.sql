-- Weighbridge hardware integration foundation. Manufacturer-agnostic device profile.

CREATE TYPE "WeighbridgeProviderType" AS ENUM ('SIMULATOR', 'SERIAL', 'TCP', 'MODBUS_RTU', 'MODBUS_TCP');
CREATE TYPE "HardwareDeviceStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'CONNECTING', 'ERROR', 'DISABLED');
CREATE TYPE "WeightQuality" AS ENUM ('STABLE', 'UNSTABLE', 'INVALID', 'NO_DATA', 'DEVICE_ERROR');

CREATE TABLE "WeighbridgeHardwareProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "weighbridgeId" TEXT NOT NULL,
    "providerType" "WeighbridgeProviderType" NOT NULL DEFAULT 'SIMULATOR',
    "connectionType" TEXT NOT NULL DEFAULT 'NONE',
    "deviceName" TEXT NOT NULL,
    "deviceIdentifier" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "pollingIntervalMs" INTEGER NOT NULL DEFAULT 500,
    "connectionTimeoutMs" INTEGER NOT NULL DEFAULT 3000,
    "healthTimeoutMs" INTEGER NOT NULL DEFAULT 15000,
    "reconnectEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reconnectDelayMs" INTEGER NOT NULL DEFAULT 3000,
    "maxReconnectAttempts" INTEGER NOT NULL DEFAULT 5,
    "stabilityToleranceKg" DECIMAL(12,3) NOT NULL DEFAULT 5.000,
    "stabilityConsecutive" INTEGER NOT NULL DEFAULT 3,
    "stabilityDurationMs" INTEGER NOT NULL DEFAULT 1500,
    "host" TEXT,
    "port" INTEGER,
    "serialPort" TEXT,
    "baudRate" INTEGER,
    "dataBits" INTEGER,
    "stopBits" INTEGER,
    "parity" TEXT,
    "protocol" TEXT,
    "modbusMapping" JSONB,
    "simulatorMode" TEXT NOT NULL DEFAULT 'AUTO',
    "simulatorBaseKg" DECIMAL(12,3),
    "lastStatus" "HardwareDeviceStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastConnectedAt" TIMESTAMP(3),
    "lastReadingAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastWeightKg" DECIMAL(12,3),
    "lastQuality" "WeightQuality",
    "lastSource" "WeighmentSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeighbridgeHardwareProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeighbridgeHardwareProfile_weighbridgeId_key" ON "WeighbridgeHardwareProfile"("weighbridgeId");
CREATE INDEX "WeighbridgeHardwareProfile_organizationId_siteId_idx" ON "WeighbridgeHardwareProfile"("organizationId", "siteId");
CREATE INDEX "WeighbridgeHardwareProfile_enabled_lastStatus_idx" ON "WeighbridgeHardwareProfile"("enabled", "lastStatus");

ALTER TABLE "WeighbridgeHardwareProfile"
  ADD CONSTRAINT "WeighbridgeHardwareProfile_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeighbridgeHardwareProfile"
  ADD CONSTRAINT "WeighbridgeHardwareProfile_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeighbridgeHardwareProfile"
  ADD CONSTRAINT "WeighbridgeHardwareProfile_weighbridgeId_fkey"
  FOREIGN KEY ("weighbridgeId") REFERENCES "Weighbridge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
