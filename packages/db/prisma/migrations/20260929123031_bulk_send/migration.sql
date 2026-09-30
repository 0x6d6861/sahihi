-- CreateEnum
CREATE TYPE "BulkSendStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE');

-- CreateEnum
CREATE TYPE "BulkSendItemStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "BulkSend" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "status" "BulkSendStatus" NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "apiKeyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BulkSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkSendItem" (
    "id" TEXT NOT NULL,
    "bulkSendId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "status" "BulkSendItemStatus" NOT NULL DEFAULT 'PENDING',
    "recipients" JSONB,
    "envelopeId" TEXT,
    "error" TEXT,

    CONSTRAINT "BulkSendItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkSend_organizationId_createdAt_idx" ON "BulkSend"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BulkSendItem_bulkSendId_row_key" ON "BulkSendItem"("bulkSendId", "row");

-- AddForeignKey
ALTER TABLE "BulkSend" ADD CONSTRAINT "BulkSend_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkSend" ADD CONSTRAINT "BulkSend_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkSend" ADD CONSTRAINT "BulkSend_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkSendItem" ADD CONSTRAINT "BulkSendItem_bulkSendId_fkey" FOREIGN KEY ("bulkSendId") REFERENCES "BulkSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;
