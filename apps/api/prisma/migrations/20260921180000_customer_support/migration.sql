-- CreateEnum
CREATE TYPE "SupportTicketCategory" AS ENUM ('WEIGHBRIDGE', 'DEVICE', 'GATEWAY', 'ANPR', 'DOCUMENT_SCANNER', 'SOFTWARE', 'NETWORK', 'OFFLINE_SYNC', 'USER_ACCESS', 'TRANSACTION', 'REPORTING', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_MAINTENANCE', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupportActivityType" AS ENUM ('COMMENT', 'INTERNAL_NOTE', 'STATUS_CHANGE', 'ASSIGNMENT', 'PRIORITY_CHANGE', 'MAINTENANCE', 'RESOLUTION');

-- CreateEnum
CREATE TYPE "SupportActivityVisibility" AS ENUM ('CUSTOMER', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ServiceMaintenanceType" AS ENUM ('CORRECTIVE', 'PREVENTIVE', 'INSPECTION', 'CALIBRATION', 'COMMISSIONING', 'REPAIR', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceMaintenanceStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "category" "SupportTicketCategory" NOT NULL,
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "assignedTeam" TEXT,
    "weighbridgeId" TEXT,
    "gatewayId" TEXT,
    "deviceId" TEXT,
    "transactionId" TEXT,
    "securityEventId" TEXT,
    "operationalAlertId" TEXT,
    "weightAnomalyEventId" TEXT,
    "resolutionSummary" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "type" "SupportActivityType" NOT NULL,
    "visibility" "SupportActivityVisibility" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMaintenanceRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "recordNumber" TEXT NOT NULL,
    "type" "ServiceMaintenanceType" NOT NULL,
    "status" "ServiceMaintenanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "findings" TEXT,
    "actionTaken" TEXT,
    "partsReplaced" TEXT,
    "beforeCondition" TEXT,
    "afterCondition" TEXT,
    "performedByUserId" TEXT,
    "ticketId" TEXT,
    "weighbridgeId" TEXT,
    "gatewayId" TEXT,
    "deviceId" TEXT,
    "securityEventId" TEXT,
    "operationalAlertId" TEXT,
    "maintenanceEventId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceMaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_organizationId_ticketNumber_key" ON "SupportTicket"("organizationId", "ticketNumber");

-- CreateIndex
CREATE INDEX "SupportTicket_organizationId_status_createdAt_idx" ON "SupportTicket"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_organizationId_priority_createdAt_idx" ON "SupportTicket"("organizationId", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_siteId_status_idx" ON "SupportTicket"("siteId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_weighbridgeId_idx" ON "SupportTicket"("weighbridgeId");

-- CreateIndex
CREATE INDEX "SupportTicket_gatewayId_idx" ON "SupportTicket"("gatewayId");

-- CreateIndex
CREATE INDEX "SupportTicket_deviceId_idx" ON "SupportTicket"("deviceId");

-- CreateIndex
CREATE INDEX "SupportTicket_transactionId_idx" ON "SupportTicket"("transactionId");

-- CreateIndex
CREATE INDEX "SupportTicket_createdByUserId_idx" ON "SupportTicket"("createdByUserId");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedUserId_idx" ON "SupportTicket"("assignedUserId");

-- CreateIndex
CREATE INDEX "SupportTicket_securityEventId_idx" ON "SupportTicket"("securityEventId");

-- CreateIndex
CREATE INDEX "SupportTicket_operationalAlertId_idx" ON "SupportTicket"("operationalAlertId");

-- CreateIndex
CREATE INDEX "SupportTicket_weightAnomalyEventId_idx" ON "SupportTicket"("weightAnomalyEventId");

-- CreateIndex
CREATE INDEX "SupportTicketActivity_ticketId_createdAt_idx" ON "SupportTicketActivity"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketActivity_organizationId_createdAt_idx" ON "SupportTicketActivity"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketActivity_actorUserId_idx" ON "SupportTicketActivity"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMaintenanceRecord_organizationId_recordNumber_key" ON "ServiceMaintenanceRecord"("organizationId", "recordNumber");

-- CreateIndex
CREATE INDEX "ServiceMaintenanceRecord_organizationId_status_createdAt_idx" ON "ServiceMaintenanceRecord"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceMaintenanceRecord_siteId_status_idx" ON "ServiceMaintenanceRecord"("siteId", "status");

-- CreateIndex
CREATE INDEX "ServiceMaintenanceRecord_weighbridgeId_idx" ON "ServiceMaintenanceRecord"("weighbridgeId");

-- CreateIndex
CREATE INDEX "ServiceMaintenanceRecord_gatewayId_idx" ON "ServiceMaintenanceRecord"("gatewayId");

-- CreateIndex
CREATE INDEX "ServiceMaintenanceRecord_deviceId_idx" ON "ServiceMaintenanceRecord"("deviceId");

-- CreateIndex
CREATE INDEX "ServiceMaintenanceRecord_ticketId_idx" ON "ServiceMaintenanceRecord"("ticketId");

-- CreateIndex
CREATE INDEX "ServiceMaintenanceRecord_performedByUserId_idx" ON "ServiceMaintenanceRecord"("performedByUserId");

-- CreateIndex
CREATE INDEX "ServiceMaintenanceRecord_maintenanceEventId_idx" ON "ServiceMaintenanceRecord"("maintenanceEventId");

-- CreateIndex
CREATE INDEX "ServiceMaintenanceRecord_securityEventId_idx" ON "ServiceMaintenanceRecord"("securityEventId");

-- CreateIndex
CREATE INDEX "ServiceMaintenanceRecord_operationalAlertId_idx" ON "ServiceMaintenanceRecord"("operationalAlertId");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_weighbridgeId_fkey" FOREIGN KEY ("weighbridgeId") REFERENCES "Weighbridge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "EdgeGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "EdgeDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_securityEventId_fkey" FOREIGN KEY ("securityEventId") REFERENCES "SecurityEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_operationalAlertId_fkey" FOREIGN KEY ("operationalAlertId") REFERENCES "OperationalAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_weightAnomalyEventId_fkey" FOREIGN KEY ("weightAnomalyEventId") REFERENCES "WeightAnomalyEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketActivity" ADD CONSTRAINT "SupportTicketActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketActivity" ADD CONSTRAINT "SupportTicketActivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketActivity" ADD CONSTRAINT "SupportTicketActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMaintenanceRecord" ADD CONSTRAINT "ServiceMaintenanceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMaintenanceRecord" ADD CONSTRAINT "ServiceMaintenanceRecord_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMaintenanceRecord" ADD CONSTRAINT "ServiceMaintenanceRecord_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMaintenanceRecord" ADD CONSTRAINT "ServiceMaintenanceRecord_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMaintenanceRecord" ADD CONSTRAINT "ServiceMaintenanceRecord_weighbridgeId_fkey" FOREIGN KEY ("weighbridgeId") REFERENCES "Weighbridge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMaintenanceRecord" ADD CONSTRAINT "ServiceMaintenanceRecord_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "EdgeGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMaintenanceRecord" ADD CONSTRAINT "ServiceMaintenanceRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "EdgeDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMaintenanceRecord" ADD CONSTRAINT "ServiceMaintenanceRecord_securityEventId_fkey" FOREIGN KEY ("securityEventId") REFERENCES "SecurityEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMaintenanceRecord" ADD CONSTRAINT "ServiceMaintenanceRecord_operationalAlertId_fkey" FOREIGN KEY ("operationalAlertId") REFERENCES "OperationalAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMaintenanceRecord" ADD CONSTRAINT "ServiceMaintenanceRecord_maintenanceEventId_fkey" FOREIGN KEY ("maintenanceEventId") REFERENCES "MaintenanceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
