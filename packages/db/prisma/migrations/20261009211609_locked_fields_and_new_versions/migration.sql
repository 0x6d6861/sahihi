-- AlterTable
ALTER TABLE "Field" ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GeneratedDocument" ADD COLUMN     "previousId" TEXT;

-- CreateIndex
CREATE INDEX "GeneratedDocument_previousId_idx" ON "GeneratedDocument"("previousId");

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_previousId_fkey" FOREIGN KEY ("previousId") REFERENCES "GeneratedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
