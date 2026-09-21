-- Material master fields used by Step 7 configuration.
ALTER TABLE "Material" ADD COLUMN "unitOfMeasure" TEXT NOT NULL DEFAULT 'MT';
ALTER TABLE "Material" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Material_organizationId_isActive_idx" ON "Material"("organizationId", "isActive");

-- Optional per-workflow settings (auto-continue, threshold). Organization-specific, not universal.
ALTER TABLE "WorkflowDefinition" ADD COLUMN "config" JSONB;

-- Transaction-level workflow snapshot and material verification.
ALTER TABLE "Transaction" ADD COLUMN "materialSource" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "materialVerifiedByUserId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "materialVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN "workflowSnapshot" JSONB;

CREATE INDEX "Transaction_materialVerifiedByUserId_idx" ON "Transaction"("materialVerifiedByUserId");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_materialVerifiedByUserId_fkey" FOREIGN KEY ("materialVerifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
