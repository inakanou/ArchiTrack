-- CreateEnum
CREATE TYPE "EstimateItemType" AS ENUM ('STANDARD', 'DISCOUNT');

-- AlterTable
ALTER TABLE "estimate_items" ADD COLUMN     "itemType" "EstimateItemType" NOT NULL DEFAULT 'STANDARD';
