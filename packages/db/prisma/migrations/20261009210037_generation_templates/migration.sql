-- AlterTable
ALTER TABLE "GeneratedDocument" ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "GenerationTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "starter" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "sourceGeneratedDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationTemplate_organizationId_createdAt_idx" ON "GenerationTemplate"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationTemplate_sourceGeneratedDocumentId_idx" ON "GenerationTemplate"("sourceGeneratedDocumentId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_templateId_idx" ON "GeneratedDocument"("templateId");

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "GenerationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationTemplate" ADD CONSTRAINT "GenerationTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationTemplate" ADD CONSTRAINT "GenerationTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationTemplate" ADD CONSTRAINT "GenerationTemplate_sourceGeneratedDocumentId_fkey" FOREIGN KEY ("sourceGeneratedDocumentId") REFERENCES "GeneratedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
