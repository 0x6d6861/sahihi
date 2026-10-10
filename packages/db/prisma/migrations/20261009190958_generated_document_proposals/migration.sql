-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'STALE');

-- CreateTable
CREATE TABLE "GeneratedDocumentProposal" (
    "id" TEXT NOT NULL,
    "generatedDocumentId" TEXT NOT NULL,
    "baseVersionId" TEXT NOT NULL,
    "sectionId" TEXT,
    "payload" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "resultVersionId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedDocumentProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedDocumentProposal_generatedDocumentId_createdAt_idx" ON "GeneratedDocumentProposal"("generatedDocumentId", "createdAt");

-- AddForeignKey
ALTER TABLE "GeneratedDocumentProposal" ADD CONSTRAINT "GeneratedDocumentProposal_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
