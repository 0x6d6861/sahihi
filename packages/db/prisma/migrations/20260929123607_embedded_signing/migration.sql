-- CreateEnum
CREATE TYPE "RecipientDelivery" AS ENUM ('EMAIL', 'EMBEDDED');

-- AlterTable
ALTER TABLE "Recipient" ADD COLUMN     "delivery" "RecipientDelivery" NOT NULL DEFAULT 'EMAIL';

-- AlterTable
ALTER TABLE "WorkspaceSettings" ADD COLUMN     "embedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[];
