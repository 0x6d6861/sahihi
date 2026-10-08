-- Multi-document envelopes and supporting files (ADR 0037).
-- Order: new tables → backfill one EnvelopeDocument / TemplateDocument per existing row → point
-- fields at them → only then drop the old single-document columns.

-- ── New tables ───────────────────────────────────────────────────────────────
CREATE TABLE "EnvelopeDocument" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "signedS3Key" TEXT,
    "signedSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnvelopeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnvelopeAttachment" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "s3Key" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADING',
    "order" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnvelopeAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplateDocument" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TemplateDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplateAttachment" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TemplateAttachment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Envelope" ADD COLUMN "bundleS3Key" TEXT;
ALTER TABLE "Field" ADD COLUMN "envelopeDocumentId" TEXT;
ALTER TABLE "TemplateField" ADD COLUMN "templateDocumentId" TEXT;

-- ── Backfill: every existing envelope / template had exactly one document ────
INSERT INTO "EnvelopeDocument" ("id", "envelopeId", "documentId", "order", "signedS3Key", "signedSha256", "createdAt")
SELECT 'ed' || e."id", e."id", e."documentId", 0, e."signedS3Key", e."signedSha256", e."createdAt"
FROM "Envelope" e;

UPDATE "Field" f SET "envelopeDocumentId" = 'ed' || f."envelopeId";

INSERT INTO "TemplateDocument" ("id", "templateId", "documentId", "order")
SELECT 'td' || t."id", t."id", t."documentId", 0
FROM "Template" t;

UPDATE "TemplateField" tf SET "templateDocumentId" = 'td' || tf."templateId";

ALTER TABLE "Field" ALTER COLUMN "envelopeDocumentId" SET NOT NULL;
ALTER TABLE "TemplateField" ALTER COLUMN "templateDocumentId" SET NOT NULL;

-- ── Drop the single-document columns ─────────────────────────────────────────
ALTER TABLE "Envelope" DROP CONSTRAINT "Envelope_documentId_fkey";
ALTER TABLE "Template" DROP CONSTRAINT "Template_documentId_fkey";
DROP INDEX "Template_documentId_idx";
ALTER TABLE "Envelope" DROP COLUMN "documentId",
DROP COLUMN "signedS3Key",
DROP COLUMN "signedSha256";
ALTER TABLE "Template" DROP COLUMN "documentId";

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX "EnvelopeDocument_envelopeId_order_idx" ON "EnvelopeDocument"("envelopeId", "order");
CREATE INDEX "EnvelopeDocument_documentId_idx" ON "EnvelopeDocument"("documentId");
CREATE INDEX "EnvelopeDocument_signedSha256_idx" ON "EnvelopeDocument"("signedSha256");
CREATE UNIQUE INDEX "EnvelopeDocument_envelopeId_documentId_key" ON "EnvelopeDocument"("envelopeId", "documentId");
CREATE UNIQUE INDEX "EnvelopeAttachment_s3Key_key" ON "EnvelopeAttachment"("s3Key");
CREATE INDEX "EnvelopeAttachment_envelopeId_order_idx" ON "EnvelopeAttachment"("envelopeId", "order");
CREATE INDEX "EnvelopeAttachment_status_createdAt_idx" ON "EnvelopeAttachment"("status", "createdAt");
CREATE INDEX "TemplateDocument_templateId_order_idx" ON "TemplateDocument"("templateId", "order");
CREATE INDEX "TemplateDocument_documentId_idx" ON "TemplateDocument"("documentId");
CREATE UNIQUE INDEX "TemplateDocument_templateId_documentId_key" ON "TemplateDocument"("templateId", "documentId");
CREATE UNIQUE INDEX "TemplateAttachment_s3Key_key" ON "TemplateAttachment"("s3Key");
CREATE INDEX "TemplateAttachment_templateId_order_idx" ON "TemplateAttachment"("templateId", "order");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
ALTER TABLE "EnvelopeDocument" ADD CONSTRAINT "EnvelopeDocument_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnvelopeDocument" ADD CONSTRAINT "EnvelopeDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnvelopeAttachment" ADD CONSTRAINT "EnvelopeAttachment_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnvelopeAttachment" ADD CONSTRAINT "EnvelopeAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Field" ADD CONSTRAINT "Field_envelopeDocumentId_fkey" FOREIGN KEY ("envelopeDocumentId") REFERENCES "EnvelopeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateDocument" ADD CONSTRAINT "TemplateDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateDocument" ADD CONSTRAINT "TemplateDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TemplateAttachment" ADD CONSTRAINT "TemplateAttachment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateField" ADD CONSTRAINT "TemplateField_templateDocumentId_fkey" FOREIGN KEY ("templateDocumentId") REFERENCES "TemplateDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
