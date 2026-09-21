-- Step 16: weight anomaly detection + weighbridge security event foundation.
-- Camera, restricted-zone, and load-cell wire-cut claims are intentionally absent.

ALTER TYPE "SecurityEventStatus" ADD VALUE 'RESOLVED';
ALTER TYPE "SecurityEventStatus" ADD VALUE 'FALSE_POSITIVE';

CREATE TYPE "WeightAnomalyType" AS ENUM (
  'EMPTY_PLATFORM_WEIGHT',
  'SUDDEN_WEIGHT_CHANGE',
  'REPEATED_INSTABILITY',
  'WEIGHT_JUMP',
  'NEGATIVE_OR_INVALID_WEIGHT'
);

CREATE TYPE "WeightAnomalyStatus" AS ENUM (
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'FALSE_POSITIVE'
);

CREATE TYPE "WeighbridgePlatformState" AS ENUM (
  'EMPTY',
  'VEHICLE_PRESENT',
  'WEIGHING',
  'UNLOADING',
  'WAITING_FOR_TARE',
  'MAINTENANCE',
  'UNKNOWN'
);

CREATE TYPE "WeightAnomalyTimelineKind" AS ENUM (
  'DETECTED',
  'PERSISTS',
  'ACKNOWLEDGED',
  'RECOVERED',
  'RESOLVED',
  'FALSE_POSITIVE',
  'SUPPRESSED'
);

CREATE TYPE "WeightAnomalyDetectorKind" AS ENUM ('RULE', 'STATISTICAL', 'ML');

CREATE TABLE "WeightAnomalyConfig" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "weighbridgeId" TEXT NOT NULL,
  "emptyPlatformThresholdKg" DECIMAL(12,3) NOT NULL DEFAULT 50.000,
  "maxChangePerSecondKg" DECIMAL(12,3) NOT NULL DEFAULT 2000.000,
  "weightJumpThresholdKg" DECIMAL(12,3) NOT NULL DEFAULT 3000.000,
  "maxInstabilityDurationMs" INTEGER NOT NULL DEFAULT 8000,
  "minAnomalyDurationMs" INTEGER NOT NULL DEFAULT 800,
  "consecutiveAnomalyCount" INTEGER NOT NULL DEFAULT 2,
  "cooldownMs" INTEGER NOT NULL DEFAULT 120000,
  "suddenChangeWindowMs" INTEGER NOT NULL DEFAULT 3000,
  "suppressAlertsInMaintenance" BOOLEAN NOT NULL DEFAULT true,
  "defaultsLabel" TEXT NOT NULL DEFAULT 'DEVELOPMENT DEFAULT',
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WeightAnomalyConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeightAnomalyConfig_weighbridgeId_key" ON "WeightAnomalyConfig"("weighbridgeId");
CREATE INDEX "WeightAnomalyConfig_organizationId_idx" ON "WeightAnomalyConfig"("organizationId");

CREATE TABLE "WeightAnomalyEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "weighbridgeId" TEXT NOT NULL,
  "deviceId" TEXT,
  "securityEventId" TEXT,
  "transactionId" TEXT,
  "type" "WeightAnomalyType" NOT NULL,
  "status" "WeightAnomalyStatus" NOT NULL DEFAULT 'OPEN',
  "severity" "NotificationSeverity" NOT NULL,
  "detectorKind" "WeightAnomalyDetectorKind" NOT NULL DEFAULT 'RULE',
  "ruleId" TEXT NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "observedWeightKg" DECIMAL(12,3),
  "previousWeightKg" DECIMAL(12,3),
  "expectedMinKg" DECIMAL(12,3),
  "expectedMaxKg" DECIMAL(12,3),
  "platformState" "WeighbridgePlatformState" NOT NULL,
  "detectionSource" TEXT NOT NULL,
  "firstDetectedAt" TIMESTAMP(3) NOT NULL,
  "lastDetectedAt" TIMESTAMP(3) NOT NULL,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "durationMs" INTEGER,
  "minObservedKg" DECIMAL(12,3),
  "maxObservedKg" DECIMAL(12,3),
  "sumObservedKg" DECIMAL(18,3),
  "recoveredAt" TIMESTAMP(3),
  "recoveredDurationMs" INTEGER,
  "suppressedDueToMaintenance" BOOLEAN NOT NULL DEFAULT false,
  "acknowledgedByUserId" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "reviewReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WeightAnomalyEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeightAnomalyEvent_securityEventId_key" ON "WeightAnomalyEvent"("securityEventId");
CREATE INDEX "WeightAnomalyEvent_organizationId_firstDetectedAt_idx" ON "WeightAnomalyEvent"("organizationId", "firstDetectedAt");
CREATE INDEX "WeightAnomalyEvent_siteId_status_idx" ON "WeightAnomalyEvent"("siteId", "status");
CREATE INDEX "WeightAnomalyEvent_weighbridgeId_type_status_idx" ON "WeightAnomalyEvent"("weighbridgeId", "type", "status");
CREATE INDEX "WeightAnomalyEvent_transactionId_idx" ON "WeightAnomalyEvent"("transactionId");
CREATE INDEX "WeightAnomalyEvent_severity_status_idx" ON "WeightAnomalyEvent"("severity", "status");

CREATE TABLE "WeightAnomalyObservation" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "kind" "WeightAnomalyTimelineKind" NOT NULL,
  "weightKg" DECIMAL(12,3),
  "quality" TEXT,
  "platformState" TEXT,
  "note" TEXT,

  CONSTRAINT "WeightAnomalyObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WeightAnomalyObservation_eventId_recordedAt_idx" ON "WeightAnomalyObservation"("eventId", "recordedAt");

ALTER TABLE "WeightAnomalyConfig" ADD CONSTRAINT "WeightAnomalyConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WeightAnomalyConfig" ADD CONSTRAINT "WeightAnomalyConfig_weighbridgeId_fkey" FOREIGN KEY ("weighbridgeId") REFERENCES "Weighbridge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WeightAnomalyConfig" ADD CONSTRAINT "WeightAnomalyConfig_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WeightAnomalyEvent" ADD CONSTRAINT "WeightAnomalyEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WeightAnomalyEvent" ADD CONSTRAINT "WeightAnomalyEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WeightAnomalyEvent" ADD CONSTRAINT "WeightAnomalyEvent_weighbridgeId_fkey" FOREIGN KEY ("weighbridgeId") REFERENCES "Weighbridge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WeightAnomalyEvent" ADD CONSTRAINT "WeightAnomalyEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeightAnomalyEvent" ADD CONSTRAINT "WeightAnomalyEvent_securityEventId_fkey" FOREIGN KEY ("securityEventId") REFERENCES "SecurityEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeightAnomalyEvent" ADD CONSTRAINT "WeightAnomalyEvent_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeightAnomalyEvent" ADD CONSTRAINT "WeightAnomalyEvent_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WeightAnomalyObservation" ADD CONSTRAINT "WeightAnomalyObservation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WeightAnomalyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
