-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "IntegrationEnvironment" AS ENUM ('TEST', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "IntegrationCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "IntegrationWebhookStatus" AS ENUM ('ACTIVE', 'DISABLED', 'REVOKED');

-- CreateEnum
CREATE TYPE "IntegrationDeliveryStatus" AS ENUM ('PENDING', 'DELIVERING', 'DELIVERED', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "IntegrationExternalType" AS ENUM ('ERP_TRANSACTION', 'PURCHASE_ORDER', 'DELIVERY_REFERENCE', 'SUPPLIER', 'CUSTOM');

-- CreateTable
CREATE TABLE "IntegrationApplication" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "environment" "IntegrationEnvironment" NOT NULL DEFAULT 'TEST',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "siteIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requestsPerMinute" INTEGER NOT NULL DEFAULT 60,
    "requestsPerHour" INTEGER NOT NULL DEFAULT 1200,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "secretPrefix" TEXT NOT NULL,
    "status" "IntegrationCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "IntegrationWebhookStatus" NOT NULL DEFAULT 'ACTIVE',
    "eventTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secretCiphertext" TEXT NOT NULL,
    "secretPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationOutboxEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "correlationId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhookDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "IntegrationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "responseStatus" INTEGER,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationIdempotencyKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationExternalReference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "externalType" "IntegrationExternalType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationExternalReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationFieldMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "externalField" TEXT NOT NULL,
    "trinetraField" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationFieldMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationRequestLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "credentialId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "rateLimited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationCredential_clientId_key" ON "IntegrationCredential"("clientId");
CREATE UNIQUE INDEX "IntegrationCredential_secretHash_key" ON "IntegrationCredential"("secretHash");
CREATE INDEX "IntegrationApplication_organizationId_status_idx" ON "IntegrationApplication"("organizationId", "status");
CREATE INDEX "IntegrationApplication_createdByUserId_idx" ON "IntegrationApplication"("createdByUserId");
CREATE INDEX "IntegrationCredential_organizationId_applicationId_idx" ON "IntegrationCredential"("organizationId", "applicationId");
CREATE INDEX "IntegrationCredential_applicationId_status_idx" ON "IntegrationCredential"("applicationId", "status");
CREATE INDEX "IntegrationWebhook_organizationId_status_idx" ON "IntegrationWebhook"("organizationId", "status");
CREATE INDEX "IntegrationWebhook_applicationId_status_idx" ON "IntegrationWebhook"("applicationId", "status");
CREATE INDEX "IntegrationOutboxEvent_organizationId_occurredAt_idx" ON "IntegrationOutboxEvent"("organizationId", "occurredAt");
CREATE INDEX "IntegrationOutboxEvent_organizationId_eventType_occurredAt_idx" ON "IntegrationOutboxEvent"("organizationId", "eventType", "occurredAt");
CREATE INDEX "IntegrationOutboxEvent_entityType_entityId_idx" ON "IntegrationOutboxEvent"("entityType", "entityId");
CREATE INDEX "IntegrationWebhookDelivery_status_nextRetryAt_idx" ON "IntegrationWebhookDelivery"("status", "nextRetryAt");
CREATE INDEX "IntegrationWebhookDelivery_organizationId_createdAt_idx" ON "IntegrationWebhookDelivery"("organizationId", "createdAt");
CREATE INDEX "IntegrationWebhookDelivery_webhookId_createdAt_idx" ON "IntegrationWebhookDelivery"("webhookId", "createdAt");
CREATE INDEX "IntegrationWebhookDelivery_applicationId_createdAt_idx" ON "IntegrationWebhookDelivery"("applicationId", "createdAt");
CREATE INDEX "IntegrationWebhookDelivery_eventId_idx" ON "IntegrationWebhookDelivery"("eventId");
CREATE UNIQUE INDEX "IntegrationIdempotencyKey_organizationId_applicationId_endpoint_idempotencyKey_key" ON "IntegrationIdempotencyKey"("organizationId", "applicationId", "endpoint", "idempotencyKey");
CREATE INDEX "IntegrationIdempotencyKey_createdAt_idx" ON "IntegrationIdempotencyKey"("createdAt");
CREATE UNIQUE INDEX "IntegrationExternalReference_organizationId_applicationId_externalType_externalId_key" ON "IntegrationExternalReference"("organizationId", "applicationId", "externalType", "externalId");
CREATE INDEX "IntegrationExternalReference_organizationId_entityType_entityId_idx" ON "IntegrationExternalReference"("organizationId", "entityType", "entityId");
CREATE INDEX "IntegrationExternalReference_applicationId_createdAt_idx" ON "IntegrationExternalReference"("applicationId", "createdAt");
CREATE UNIQUE INDEX "IntegrationFieldMapping_organizationId_applicationId_externalField_key" ON "IntegrationFieldMapping"("organizationId", "applicationId", "externalField");
CREATE INDEX "IntegrationFieldMapping_applicationId_idx" ON "IntegrationFieldMapping"("applicationId");
CREATE INDEX "IntegrationRequestLog_organizationId_createdAt_idx" ON "IntegrationRequestLog"("organizationId", "createdAt");
CREATE INDEX "IntegrationRequestLog_applicationId_createdAt_idx" ON "IntegrationRequestLog"("applicationId", "createdAt");
CREATE INDEX "IntegrationRequestLog_requestId_idx" ON "IntegrationRequestLog"("requestId");

ALTER TABLE "IntegrationApplication" ADD CONSTRAINT "IntegrationApplication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationApplication" ADD CONSTRAINT "IntegrationApplication_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "IntegrationApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationWebhook" ADD CONSTRAINT "IntegrationWebhook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationWebhook" ADD CONSTRAINT "IntegrationWebhook_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "IntegrationApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationOutboxEvent" ADD CONSTRAINT "IntegrationOutboxEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationWebhookDelivery" ADD CONSTRAINT "IntegrationWebhookDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationWebhookDelivery" ADD CONSTRAINT "IntegrationWebhookDelivery_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "IntegrationApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationWebhookDelivery" ADD CONSTRAINT "IntegrationWebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "IntegrationWebhook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationWebhookDelivery" ADD CONSTRAINT "IntegrationWebhookDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "IntegrationOutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationIdempotencyKey" ADD CONSTRAINT "IntegrationIdempotencyKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationIdempotencyKey" ADD CONSTRAINT "IntegrationIdempotencyKey_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "IntegrationApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationExternalReference" ADD CONSTRAINT "IntegrationExternalReference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationExternalReference" ADD CONSTRAINT "IntegrationExternalReference_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "IntegrationApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationFieldMapping" ADD CONSTRAINT "IntegrationFieldMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationFieldMapping" ADD CONSTRAINT "IntegrationFieldMapping_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "IntegrationApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationRequestLog" ADD CONSTRAINT "IntegrationRequestLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationRequestLog" ADD CONSTRAINT "IntegrationRequestLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "IntegrationApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
