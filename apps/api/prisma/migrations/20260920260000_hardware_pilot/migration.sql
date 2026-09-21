-- CreateEnum
CREATE TYPE "OperationMode" AS ENUM ('SIMULATION', 'PILOT', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "HardwareInstallationStatus" AS ENUM ('PLANNED', 'CONFIGURED', 'CONNECTED', 'TESTING', 'PILOT', 'PRODUCTION', 'DISABLED');

-- CreateEnum
CREATE TYPE "HardwareProtocolReadiness" AS ENUM ('SIMULATOR', 'PROTOCOL_DETAILS_REQUIRED', 'PROTOCOL_TEST_ONLY', 'DOCUMENTED');

-- CreateEnum
CREATE TYPE "CommissioningTestResult" AS ENUM ('PASS', 'FAIL', 'NOT_TESTED');

-- AlterTable
ALTER TABLE "Site" ADD COLUMN "operationMode" "OperationMode" NOT NULL DEFAULT 'SIMULATION';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "operationMode" "OperationMode" NOT NULL DEFAULT 'SIMULATION';

-- AlterTable
ALTER TABLE "EdgeDevice" ADD COLUMN "firmwareVersion" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "host" TEXT,
ADD COLUMN "port" INTEGER,
ADD COLUMN "serialPort" TEXT,
ADD COLUMN "adapterKey" TEXT,
ADD COLUMN "protocolReadiness" "HardwareProtocolReadiness" NOT NULL DEFAULT 'SIMULATOR',
ADD COLUMN "installationStatus" "HardwareInstallationStatus" NOT NULL DEFAULT 'PLANNED',
ADD COLUMN "lastDiagnostic" JSONB,
ADD COLUMN "lastClockIssue" TEXT;

-- CreateTable
CREATE TABLE "HardwareCommissioningTest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "testKey" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "result" "CommissioningTestResult" NOT NULL DEFAULT 'NOT_TESTED',
    "notes" TEXT,
    "error" TEXT,
    "testedAt" TIMESTAMP(3),
    "testedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HardwareCommissioningTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HardwareCommissioningTest_deviceId_testKey_key" ON "HardwareCommissioningTest"("deviceId", "testKey");

-- CreateIndex
CREATE INDEX "HardwareCommissioningTest_organizationId_siteId_idx" ON "HardwareCommissioningTest"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "HardwareCommissioningTest_testedByUserId_idx" ON "HardwareCommissioningTest"("testedByUserId");

-- CreateIndex
CREATE INDEX "EdgeDevice_installationStatus_idx" ON "EdgeDevice"("installationStatus");

-- AddForeignKey
ALTER TABLE "HardwareCommissioningTest" ADD CONSTRAINT "HardwareCommissioningTest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HardwareCommissioningTest" ADD CONSTRAINT "HardwareCommissioningTest_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HardwareCommissioningTest" ADD CONSTRAINT "HardwareCommissioningTest_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "EdgeDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HardwareCommissioningTest" ADD CONSTRAINT "HardwareCommissioningTest_testedByUserId_fkey" FOREIGN KEY ("testedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
