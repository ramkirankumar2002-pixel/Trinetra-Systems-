-- CreateEnum
CREATE TYPE "BackupRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "BackupTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'STARTUP');

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "status" "BackupRunStatus" NOT NULL,
    "trigger" "BackupTrigger" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "sizeBytes" INTEGER,
    "relativeName" TEXT,
    "checksumSha256" TEXT,
    "errorCode" TEXT,
    "keep" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BackupRun" ADD CONSTRAINT "BackupRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "BackupRun_status_startedAt_idx" ON "BackupRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "BackupRun_organizationId_startedAt_idx" ON "BackupRun"("organizationId", "startedAt");

INSERT INTO "Permission" ("id", "code", "name", "group")
SELECT 'perm_reliability_read', 'reliability.read', 'Read recovery and backup status', 'reliability'
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code" = 'reliability.read');

INSERT INTO "Permission" ("id", "code", "name", "group")
SELECT 'perm_reliability_manage', 'reliability.manage', 'Run backup and consistency scans', 'reliability'
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code" = 'reliability.manage');

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT concat('rp_rel_read_', r."id"), r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."code" = 'reliability.read'
  AND r."code" IN ('ADMIN', 'SUPERVISOR', 'OFFICE_MANAGER')
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" rp
    WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
  );

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT concat('rp_rel_manage_', r."id"), r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."code" = 'reliability.manage'
  AND r."code" IN ('ADMIN', 'SUPERVISOR', 'OFFICE_MANAGER')
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" rp
    WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
  );
