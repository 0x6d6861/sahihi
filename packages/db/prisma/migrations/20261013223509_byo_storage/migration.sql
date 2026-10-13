-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('AWS_S3', 'CLOUDFLARE_R2', 'BACKBLAZE_B2', 'WASABI', 'DIGITALOCEAN_SPACES', 'GOOGLE_CLOUD_STORAGE', 'S3_COMPATIBLE', 'GOOGLE_DRIVE', 'ONEDRIVE');

-- CreateEnum
CREATE TYPE "StoragePurpose" AS ENUM ('SYNC', 'PRIMARY');

-- CreateEnum
CREATE TYPE "StorageAuthMethod" AS ENUM ('ACCESS_KEYS', 'AWS_ROLE', 'OAUTH');

-- CreateEnum
CREATE TYPE "StorageConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILING');

-- CreateEnum
CREATE TYPE "StoragePrimaryState" AS ENUM ('MIGRATING_IN', 'ACTIVE', 'MIGRATING_OUT');

-- CreateEnum
CREATE TYPE "StorageDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "StorageReleaseReason" AS ENUM ('DELETED', 'REPLACED', 'UPLOAD_REJECTED', 'RETENTION', 'EXPIRED', 'WORKSPACE_DELETED');

-- CreateTable
CREATE TABLE "StorageConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "purpose" "StoragePurpose" NOT NULL,
    "provider" "StorageProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT,
    "region" TEXT,
    "bucket" TEXT,
    "prefix" TEXT NOT NULL DEFAULT '',
    "forcePathStyle" BOOLEAN NOT NULL DEFAULT false,
    "auth" "StorageAuthMethod" NOT NULL,
    "accessKeyId" TEXT,
    "secretEncrypted" TEXT,
    "secretHint" TEXT,
    "roleArn" TEXT,
    "externalId" TEXT,
    "accountEmail" TEXT,
    "rootFolder" TEXT,
    "folderTemplate" TEXT NOT NULL DEFAULT '{yyyy}/{mm}/{title} ({id})',
    "status" "StorageConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "primaryState" "StoragePrimaryState",
    "migratedCount" INTEGER NOT NULL DEFAULT 0,
    "migrateTotal" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "status" "StorageDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "path" TEXT,
    "fileCount" INTEGER,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageRelease" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "key" TEXT NOT NULL,
    "reason" "StorageReleaseReason" NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorageConnection_organizationId_purpose_idx" ON "StorageConnection"("organizationId", "purpose");

-- CreateIndex
CREATE INDEX "StorageDelivery_organizationId_createdAt_idx" ON "StorageDelivery"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "StorageDelivery_status_createdAt_idx" ON "StorageDelivery"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorageDelivery_connectionId_envelopeId_key" ON "StorageDelivery"("connectionId", "envelopeId");

-- CreateIndex
CREATE INDEX "StorageRelease_organizationId_releasedAt_idx" ON "StorageRelease"("organizationId", "releasedAt");

-- AddForeignKey
ALTER TABLE "StorageConnection" ADD CONSTRAINT "StorageConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageConnection" ADD CONSTRAINT "StorageConnection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageDelivery" ADD CONSTRAINT "StorageDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageDelivery" ADD CONSTRAINT "StorageDelivery_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StorageConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageDelivery" ADD CONSTRAINT "StorageDelivery_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageRelease" ADD CONSTRAINT "StorageRelease_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageRelease" ADD CONSTRAINT "StorageRelease_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StorageConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
