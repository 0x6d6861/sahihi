-- CreateEnum
CREATE TYPE "GeneratedDocumentStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateEnum
CREATE TYPE "GenerationActor" AS ENUM ('USER', 'AI');

-- AlterTable
ALTER TABLE "WorkspaceSettings" ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "starter" TEXT NOT NULL,
    "status" "GeneratedDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "finalizedVersionId" TEXT,
    "documentId" TEXT,
    "envelopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDocumentVersion" (
    "id" TEXT NOT NULL,
    "generatedDocumentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "actor" "GenerationActor" NOT NULL,
    "createdById" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDocumentEvent" (
    "id" TEXT NOT NULL,
    "generatedDocumentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" "GenerationActor" NOT NULL,
    "actorUserId" TEXT,
    "versionId" TEXT,
    "data" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedDocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedDocument_organizationId_createdAt_idx" ON "GeneratedDocument"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedDocument_documentId_idx" ON "GeneratedDocument"("documentId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_envelopeId_idx" ON "GeneratedDocument"("envelopeId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedDocumentVersion_generatedDocumentId_number_key" ON "GeneratedDocumentVersion"("generatedDocumentId", "number");

-- CreateIndex
CREATE INDEX "GeneratedDocumentEvent_generatedDocumentId_occurredAt_idx" ON "GeneratedDocumentEvent"("generatedDocumentId", "occurredAt");

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocumentVersion" ADD CONSTRAINT "GeneratedDocumentVersion_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocumentEvent" ADD CONSTRAINT "GeneratedDocumentEvent_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Versions and events are append-only (docs/ai-documents.md, same rule as AuditEvent, ADR 0010).
-- DELETE stays possible so deleting a generated document, workspace or account still cascades.
CREATE FUNCTION "generated_document_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege', HINT = 'docs/ai-documents.md';
END
$$;

CREATE TRIGGER "GeneratedDocumentVersion_no_update"
  BEFORE UPDATE ON "GeneratedDocumentVersion"
  FOR EACH ROW EXECUTE FUNCTION "generated_document_append_only"();

CREATE TRIGGER "GeneratedDocumentEvent_no_update"
  BEFORE UPDATE ON "GeneratedDocumentEvent"
  FOR EACH ROW EXECUTE FUNCTION "generated_document_append_only"();
