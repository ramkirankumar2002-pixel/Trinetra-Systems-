-- Step 17: offline-first Edge operation, synchronization, and recovery.
-- The Edge does not receive a copy of the central PostgreSQL database.

ALTER TYPE "EdgeEventType" ADD VALUE 'LOCAL_TRANSACTION_CREATED';
ALTER TYPE "EdgeEventType" ADD VALUE 'LOCAL_TRANSACTION_STATE';
ALTER TYPE "EdgeEventType" ADD VALUE 'LOCAL_WEIGHT_ANOMALY';
ALTER TYPE "EdgeEventType" ADD VALUE 'LOCAL_FILE_CAPTURED';
ALTER TYPE "EdgeEventType" ADD VALUE 'CONNECTIVITY_CHANGED';

CREATE TYPE "EdgeConnectivityState" AS ENUM (
  'ONLINE',
  'DEGRADED',
  'OFFLINE',
  'SYNCING',
  'RECOVERING',
  'ERROR'
);

CREATE TYPE "EdgeEventPriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');

CREATE TYPE "EdgeSyncAckStatus" AS ENUM (
  'ACCEPTED',
  'ALREADY_PROCESSED',
  'CONFLICT',
  'REJECTED',
  'DEPENDENCY_PENDING'
);

CREATE TYPE "EdgeSyncConflictStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TYPE "OfflineCapability" AS ENUM ('ALLOWED', 'CONDITIONAL', 'BLOCKED');

ALTER TABLE "EdgeIngestedEvent"
  ADD COLUMN "priority" "EdgeEventPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "localTransactionId" TEXT,
  ADD COLUMN "payloadHash" TEXT,
  ADD COLUMN "ackStatus" "EdgeSyncAckStatus",
  ADD COLUMN "dependencyEventId" TEXT;

CREATE INDEX "EdgeIngestedEvent_localTransactionId_idx" ON "EdgeIngestedEvent"("localTransactionId");
CREATE INDEX "EdgeIngestedEvent_priority_createdAt_idx" ON "EdgeIngestedEvent"("priority", "createdAt");

ALTER TABLE "WeightAnomalyEvent" ADD COLUMN "sourceEventId" TEXT;
CREATE UNIQUE INDEX "WeightAnomalyEvent_sourceEventId_key" ON "WeightAnomalyEvent"("sourceEventId");

CREATE TABLE "OfflinePolicy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "source" TEXT NOT NULL DEFAULT 'CENTRAL',
  "allowWeightRead" BOOLEAN NOT NULL DEFAULT true,
  "allowAnpr" BOOLEAN NOT NULL DEFAULT true,
  "allowDocumentCapture" BOOLEAN NOT NULL DEFAULT true,
  "allowBasicTransactionRecording" BOOLEAN NOT NULL DEFAULT true,
  "allowWeightAnomalyDetection" BOOLEAN NOT NULL DEFAULT true,
  "transactionCompletion" "OfflineCapability" NOT NULL DEFAULT 'CONDITIONAL',
  "materialVerification" "OfflineCapability" NOT NULL DEFAULT 'CONDITIONAL',
  "approvals" "OfflineCapability" NOT NULL DEFAULT 'BLOCKED',
  "configChanges" "OfflineCapability" NOT NULL DEFAULT 'BLOCKED',
  "userManagement" "OfflineCapability" NOT NULL DEFAULT 'BLOCKED',
  "hardwareConfigChanges" "OfflineCapability" NOT NULL DEFAULT 'BLOCKED',
  "maxConfigAgeHours" INTEGER NOT NULL DEFAULT 24,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OfflinePolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfflinePolicy_organizationId_siteId_key" ON "OfflinePolicy"("organizationId", "siteId");
CREATE INDEX "OfflinePolicy_organizationId_idx" ON "OfflinePolicy"("organizationId");

CREATE TABLE "EdgeLocalTransactionMap" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "gatewayId" TEXT NOT NULL,
  "localTransactionId" TEXT NOT NULL,
  "transactionId" TEXT,
  "vehicleNumber" TEXT,
  "weighbridgeId" TEXT,
  "localState" TEXT NOT NULL,
  "centralStatus" TEXT,
  "completionState" TEXT NOT NULL DEFAULT 'NONE',
  "grossWeightKg" DECIMAL(12,3),
  "tareWeightKg" DECIMAL(12,3),
  "netWeightKg" DECIMAL(12,3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EdgeLocalTransactionMap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EdgeLocalTransactionMap_gatewayId_localTransactionId_key" ON "EdgeLocalTransactionMap"("gatewayId", "localTransactionId");
CREATE INDEX "EdgeLocalTransactionMap_organizationId_siteId_idx" ON "EdgeLocalTransactionMap"("organizationId", "siteId");
CREATE INDEX "EdgeLocalTransactionMap_transactionId_idx" ON "EdgeLocalTransactionMap"("transactionId");

CREATE TABLE "EdgeSyncSnapshot" (
  "gatewayId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "connectivityState" "EdgeConnectivityState" NOT NULL,
  "internetStatus" TEXT NOT NULL,
  "backendStatus" TEXT NOT NULL,
  "hardwareStatus" TEXT NOT NULL,
  "syncStatus" TEXT NOT NULL,
  "queued" INTEGER NOT NULL DEFAULT 0,
  "syncing" INTEGER NOT NULL DEFAULT 0,
  "synced" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "deadLetter" INTEGER NOT NULL DEFAULT 0,
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "lastError" TEXT,
  "storageUsedBytes" INTEGER NOT NULL DEFAULT 0,
  "storageLimitBytes" INTEGER NOT NULL DEFAULT 524288000,
  "configVersion" TEXT,
  "configCachedAt" TIMESTAMP(3),
  "configStale" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EdgeSyncSnapshot_pkey" PRIMARY KEY ("gatewayId")
);

CREATE INDEX "EdgeSyncSnapshot_organizationId_siteId_idx" ON "EdgeSyncSnapshot"("organizationId", "siteId");

CREATE TABLE "EdgeSyncConflict" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "gatewayId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "localTransactionId" TEXT,
  "transactionId" TEXT,
  "localState" TEXT NOT NULL,
  "centralState" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "recommendedAction" TEXT NOT NULL,
  "status" "EdgeSyncConflictStatus" NOT NULL DEFAULT 'OPEN',
  "acknowledgedByUserId" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EdgeSyncConflict_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EdgeSyncConflict_gatewayId_eventId_key" ON "EdgeSyncConflict"("gatewayId", "eventId");
CREATE INDEX "EdgeSyncConflict_organizationId_status_createdAt_idx" ON "EdgeSyncConflict"("organizationId", "status", "createdAt");
CREATE INDEX "EdgeSyncConflict_transactionId_idx" ON "EdgeSyncConflict"("transactionId");

CREATE TABLE "EdgeDeadLetter" (
  "eventId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "gatewayId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "error" TEXT NOT NULL,
  "retryCount" INTEGER NOT NULL,
  "firstFailureAt" TIMESTAMP(3) NOT NULL,
  "lastFailureAt" TIMESTAMP(3) NOT NULL,
  "payloadRef" JSONB NOT NULL,
  "recommendedAction" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EdgeDeadLetter_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "EdgeDeadLetter_organizationId_gatewayId_idx" ON "EdgeDeadLetter"("organizationId", "gatewayId");

CREATE TABLE "EdgeSyncedFile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "gatewayId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "eventId" TEXT,
  "documentId" TEXT,
  "contentBase64" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EdgeSyncedFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EdgeSyncedFile_gatewayId_fileId_key" ON "EdgeSyncedFile"("gatewayId", "fileId");
CREATE UNIQUE INDEX "EdgeSyncedFile_gatewayId_contentHash_key" ON "EdgeSyncedFile"("gatewayId", "contentHash");
CREATE INDEX "EdgeSyncedFile_organizationId_siteId_idx" ON "EdgeSyncedFile"("organizationId", "siteId");

ALTER TABLE "OfflinePolicy" ADD CONSTRAINT "OfflinePolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfflinePolicy" ADD CONSTRAINT "OfflinePolicy_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EdgeLocalTransactionMap" ADD CONSTRAINT "EdgeLocalTransactionMap_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EdgeLocalTransactionMap" ADD CONSTRAINT "EdgeLocalTransactionMap_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EdgeLocalTransactionMap" ADD CONSTRAINT "EdgeLocalTransactionMap_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "EdgeGateway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EdgeLocalTransactionMap" ADD CONSTRAINT "EdgeLocalTransactionMap_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EdgeSyncSnapshot" ADD CONSTRAINT "EdgeSyncSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EdgeSyncSnapshot" ADD CONSTRAINT "EdgeSyncSnapshot_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EdgeSyncSnapshot" ADD CONSTRAINT "EdgeSyncSnapshot_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "EdgeGateway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EdgeSyncConflict" ADD CONSTRAINT "EdgeSyncConflict_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EdgeSyncConflict" ADD CONSTRAINT "EdgeSyncConflict_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EdgeSyncConflict" ADD CONSTRAINT "EdgeSyncConflict_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "EdgeGateway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EdgeSyncConflict" ADD CONSTRAINT "EdgeSyncConflict_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EdgeSyncConflict" ADD CONSTRAINT "EdgeSyncConflict_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EdgeSyncConflict" ADD CONSTRAINT "EdgeSyncConflict_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EdgeDeadLetter" ADD CONSTRAINT "EdgeDeadLetter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EdgeDeadLetter" ADD CONSTRAINT "EdgeDeadLetter_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EdgeDeadLetter" ADD CONSTRAINT "EdgeDeadLetter_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "EdgeGateway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EdgeSyncedFile" ADD CONSTRAINT "EdgeSyncedFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EdgeSyncedFile" ADD CONSTRAINT "EdgeSyncedFile_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EdgeSyncedFile" ADD CONSTRAINT "EdgeSyncedFile_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "EdgeGateway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
