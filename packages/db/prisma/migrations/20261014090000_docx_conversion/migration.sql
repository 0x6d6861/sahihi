-- AlterEnum
ALTER TYPE "DocumentStatus" ADD VALUE 'CONVERTING';

-- CreateEnum
CREATE TYPE "DocumentSourceFormat" AS ENUM ('DOCX');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "convertedFrom" "DocumentSourceFormat";
