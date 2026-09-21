-- In-app notification foundation + operational alerts (not SecurityEvent).

CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR', 'CRITICAL');
CREATE TYPE "NotificationCategory" AS ENUM ('WORKFLOW', 'APPROVAL', 'EXCEPTION', 'SYSTEM');
CREATE TYPE "OperationalAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

ALTER TABLE "Notification" ADD COLUMN "siteId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "category" "NotificationCategory";
ALTER TABLE "Notification" ADD COLUMN "severity" "NotificationSeverity";
ALTER TABLE "Notification" ADD COLUMN "entityType" TEXT;
ALTER TABLE "Notification" ADD COLUMN "entityId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "eventKey" TEXT;

UPDATE "Notification"
SET
  "type" = CASE WHEN "type" = 'APPROVAL_REQUESTED' THEN 'APPROVAL_REQUIRED' ELSE "type" END,
  "category" = CASE
    WHEN "type" IN ('APPROVAL_REQUIRED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'APPROVAL_REQUESTED') THEN 'APPROVAL'::"NotificationCategory"
    WHEN "type" IN ('TRANSACTION_EXCEPTION', 'WEIGHT_EXCEPTION', 'WORKFLOW_EXCEPTION') THEN 'EXCEPTION'::"NotificationCategory"
    WHEN "type" = 'SYSTEM_ALERT' THEN 'SYSTEM'::"NotificationCategory"
    ELSE 'WORKFLOW'::"NotificationCategory"
  END,
  "severity" = CASE
    WHEN "type" IN ('APPROVAL_APPROVED', 'DOCUMENT_VERIFIED', 'TRANSACTION_COMPLETED') THEN 'SUCCESS'::"NotificationSeverity"
    WHEN "type" IN ('APPROVAL_REQUIRED', 'DOCUMENT_REVIEW_REQUIRED', 'SECOND_WEIGHMENT_REQUIRED') THEN 'WARNING'::"NotificationSeverity"
    WHEN "type" IN ('APPROVAL_REJECTED', 'TRANSACTION_EXCEPTION', 'WEIGHT_EXCEPTION', 'WORKFLOW_EXCEPTION') THEN 'ERROR'::"NotificationSeverity"
    WHEN "type" = 'SYSTEM_ALERT' THEN 'ERROR'::"NotificationSeverity"
    ELSE 'INFO'::"NotificationSeverity"
  END,
  "entityType" = CASE
    WHEN "approvalId" IS NOT NULL THEN 'Approval'
    WHEN "transactionId" IS NOT NULL THEN 'Transaction'
    ELSE NULL
  END,
  "entityId" = COALESCE("approvalId", "transactionId"),
  "eventKey" = 'legacy:' || "id";

ALTER TABLE "Notification" ALTER COLUMN "category" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "category" SET DEFAULT 'WORKFLOW';
ALTER TABLE "Notification" ALTER COLUMN "severity" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "severity" SET DEFAULT 'INFO';
ALTER TABLE "Notification" ALTER COLUMN "eventKey" SET NOT NULL;

CREATE UNIQUE INDEX "Notification_recipientUserId_eventKey_key" ON "Notification"("recipientUserId", "eventKey");
CREATE INDEX "Notification_siteId_createdAt_idx" ON "Notification"("siteId", "createdAt");
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");
CREATE INDEX "Notification_severity_idx" ON "Notification"("severity");
CREATE INDEX "Notification_category_idx" ON "Notification"("category");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_userId_category_key" ON "NotificationPreference"("userId", "category");
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OperationalAlert" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" "NotificationSeverity" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "OperationalAlertStatus" NOT NULL DEFAULT 'OPEN',
  "entityType" TEXT,
  "entityId" TEXT,
  "transactionId" TEXT,
  "eventKey" TEXT NOT NULL,
  "acknowledgedByUserId" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperationalAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalAlert_organizationId_eventKey_key" ON "OperationalAlert"("organizationId", "eventKey");
CREATE INDEX "OperationalAlert_organizationId_status_createdAt_idx" ON "OperationalAlert"("organizationId", "status", "createdAt");
CREATE INDEX "OperationalAlert_siteId_status_createdAt_idx" ON "OperationalAlert"("siteId", "status", "createdAt");
CREATE INDEX "OperationalAlert_type_status_idx" ON "OperationalAlert"("type", "status");
CREATE INDEX "OperationalAlert_severity_status_idx" ON "OperationalAlert"("severity", "status");
CREATE INDEX "OperationalAlert_transactionId_idx" ON "OperationalAlert"("transactionId");
CREATE INDEX "OperationalAlert_acknowledgedByUserId_idx" ON "OperationalAlert"("acknowledgedByUserId");
CREATE INDEX "OperationalAlert_resolvedByUserId_idx" ON "OperationalAlert"("resolvedByUserId");

ALTER TABLE "OperationalAlert"
  ADD CONSTRAINT "OperationalAlert_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalAlert"
  ADD CONSTRAINT "OperationalAlert_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalAlert"
  ADD CONSTRAINT "OperationalAlert_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalAlert"
  ADD CONSTRAINT "OperationalAlert_acknowledgedByUserId_fkey"
  FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalAlert"
  ADD CONSTRAINT "OperationalAlert_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
