-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN "transporterName" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "supplierId" TEXT;

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_idx" ON "Vehicle"("organizationId");

-- CreateIndex
CREATE INDEX "Vehicle_supplierId_idx" ON "Vehicle"("supplierId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
