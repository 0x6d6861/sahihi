-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "sourceDocumentId" TEXT;

-- CreateIndex
CREATE INDEX "Document_sourceDocumentId_idx" ON "Document"("sourceDocumentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
