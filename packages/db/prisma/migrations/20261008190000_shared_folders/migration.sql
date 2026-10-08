-- AlterTable
ALTER TABLE "Envelope" ADD COLUMN     "color" TEXT,
ADD COLUMN     "folderId" TEXT;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "color" TEXT,
ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "_TagToTemplate" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TagToTemplate_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_EnvelopeToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EnvelopeToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TagToTemplate_B_index" ON "_TagToTemplate"("B");

-- CreateIndex
CREATE INDEX "_EnvelopeToTag_B_index" ON "_EnvelopeToTag"("B");

-- CreateIndex
CREATE INDEX "Envelope_organizationId_folderId_createdAt_idx" ON "Envelope"("organizationId", "folderId", "createdAt");

-- CreateIndex
CREATE INDEX "Template_organizationId_folderId_createdAt_idx" ON "Template"("organizationId", "folderId", "createdAt");

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToTemplate" ADD CONSTRAINT "_TagToTemplate_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToTemplate" ADD CONSTRAINT "_TagToTemplate_B_fkey" FOREIGN KEY ("B") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EnvelopeToTag" ADD CONSTRAINT "_EnvelopeToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EnvelopeToTag" ADD CONSTRAINT "_EnvelopeToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

