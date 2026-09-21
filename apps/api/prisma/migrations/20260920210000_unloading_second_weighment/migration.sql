-- CreateEnum
CREATE TYPE "UnloadingPointStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TransactionCorrectionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'APPLIED', 'REJECTED');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "completedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Unloading" ADD COLUMN "unloadingPointId" TEXT;
ALTER TABLE "Unloading" ADD COLUMN "startedByUserId" TEXT;
ALTER TABLE "Unloading" ADD COLUMN "assignedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UnloadingPoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "UnloadingPointStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowedMaterialIds" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UnloadingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnloadingPointAssignmentRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "materialId" TEXT,
    "unloadingPointId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnloadingPointAssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionCorrection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "originalValue" TEXT NOT NULL,
    "proposedValue" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TransactionCorrectionStatus" NOT NULL DEFAULT 'REQUESTED',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnloadingPoint_siteId_code_key" ON "UnloadingPoint"("siteId", "code");

-- CreateIndex
CREATE INDEX "UnloadingPoint_organizationId_siteId_status_idx" ON "UnloadingPoint"("organizationId", "siteId", "status");

-- CreateIndex
CREATE INDEX "UnloadingPointAssignmentRule_siteId_priority_idx" ON "UnloadingPointAssignmentRule"("siteId", "priority");

-- CreateIndex
CREATE INDEX "UnloadingPointAssignmentRule_organizationId_idx" ON "UnloadingPointAssignmentRule"("organizationId");

-- CreateIndex
CREATE INDEX "UnloadingPointAssignmentRule_materialId_idx" ON "UnloadingPointAssignmentRule"("materialId");

-- CreateIndex
CREATE INDEX "UnloadingPointAssignmentRule_unloadingPointId_idx" ON "UnloadingPointAssignmentRule"("unloadingPointId");

-- CreateIndex
CREATE INDEX "TransactionCorrection_transactionId_requestedAt_idx" ON "TransactionCorrection"("transactionId", "requestedAt");

-- CreateIndex
CREATE INDEX "TransactionCorrection_organizationId_status_idx" ON "TransactionCorrection"("organizationId", "status");

-- CreateIndex
CREATE INDEX "TransactionCorrection_requestedByUserId_idx" ON "TransactionCorrection"("requestedByUserId");

-- CreateIndex
CREATE INDEX "TransactionCorrection_reviewedByUserId_idx" ON "TransactionCorrection"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "Transaction_completedByUserId_idx" ON "Transaction"("completedByUserId");

-- CreateIndex
CREATE INDEX "Unloading_unloadingPointId_idx" ON "Unloading"("unloadingPointId");

-- CreateIndex
CREATE INDEX "Unloading_startedByUserId_idx" ON "Unloading"("startedByUserId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnloadingPoint" ADD CONSTRAINT "UnloadingPoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnloadingPoint" ADD CONSTRAINT "UnloadingPoint_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnloadingPointAssignmentRule" ADD CONSTRAINT "UnloadingPointAssignmentRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnloadingPointAssignmentRule" ADD CONSTRAINT "UnloadingPointAssignmentRule_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnloadingPointAssignmentRule" ADD CONSTRAINT "UnloadingPointAssignmentRule_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnloadingPointAssignmentRule" ADD CONSTRAINT "UnloadingPointAssignmentRule_unloadingPointId_fkey" FOREIGN KEY ("unloadingPointId") REFERENCES "UnloadingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unloading" ADD CONSTRAINT "Unloading_unloadingPointId_fkey" FOREIGN KEY ("unloadingPointId") REFERENCES "UnloadingPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unloading" ADD CONSTRAINT "Unloading_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCorrection" ADD CONSTRAINT "TransactionCorrection_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
