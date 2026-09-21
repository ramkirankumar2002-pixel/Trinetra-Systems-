-- Approval state used when a pending request is withdrawn without a decision.
ALTER TYPE "ApprovalDecision" ADD VALUE 'CANCELLED';

-- Snapshot-safe approval requests (do not depend on later Material Master edits).
ALTER TABLE "Approval" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Approval" ADD COLUMN "siteId" TEXT;
ALTER TABLE "Approval" ADD COLUMN "snapshotStepSortOrder" INTEGER;
ALTER TABLE "Approval" ADD COLUMN "snapshotCapability" TEXT;
ALTER TABLE "Approval" ADD COLUMN "snapshotStepName" TEXT;
ALTER TABLE "Approval" ADD COLUMN "requestedRoleCode" TEXT;
ALTER TABLE "Approval" ADD COLUMN "assignedUserId" TEXT;

UPDATE "Approval" AS approval
SET
  "organizationId" = transaction."organizationId",
  "siteId" = transaction."siteId",
  "snapshotStepSortOrder" = approval."stage",
  "snapshotCapability" = 'APPROVAL',
  "snapshotStepName" = 'Approval'
FROM "Transaction" AS transaction
WHERE transaction."id" = approval."transactionId";

ALTER TABLE "Approval" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "siteId" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "snapshotStepSortOrder" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "snapshotCapability" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "snapshotStepName" SET NOT NULL;

CREATE UNIQUE INDEX "Approval_transactionId_snapshotStepSortOrder_decision_key"
  ON "Approval"("transactionId", "snapshotStepSortOrder", "decision");

CREATE INDEX "Approval_organizationId_decision_requestedAt_idx"
  ON "Approval"("organizationId", "decision", "requestedAt");

CREATE INDEX "Approval_departmentId_decision_idx" ON "Approval"("departmentId", "decision");
CREATE INDEX "Approval_siteId_decision_idx" ON "Approval"("siteId", "decision");
CREATE INDEX "Approval_assignedUserId_idx" ON "Approval"("assignedUserId");

ALTER TABLE "Approval"
  ADD CONSTRAINT "Approval_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Approval"
  ADD CONSTRAINT "Approval_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Approval"
  ADD CONSTRAINT "Approval_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "transactionId" TEXT,
  "approvalId" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_recipientUserId_readAt_createdAt_idx"
  ON "Notification"("recipientUserId", "readAt", "createdAt");
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");
CREATE INDEX "Notification_transactionId_idx" ON "Notification"("transactionId");
CREATE INDEX "Notification_approvalId_idx" ON "Notification"("approvalId");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_approvalId_fkey"
  FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE SET NULL ON UPDATE CASCADE;
