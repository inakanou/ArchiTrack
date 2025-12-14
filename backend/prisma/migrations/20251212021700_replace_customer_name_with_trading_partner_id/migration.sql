-- DropIndex
DROP INDEX "projects_customerName_idx";

-- AlterTable: Drop customerName, Add tradingPartnerId
ALTER TABLE "projects" DROP COLUMN "customerName";
ALTER TABLE "projects" ADD COLUMN "tradingPartnerId" TEXT;

-- CreateIndex
CREATE INDEX "projects_tradingPartnerId_idx" ON "projects"("tradingPartnerId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_tradingPartnerId_fkey" FOREIGN KEY ("tradingPartnerId") REFERENCES "trading_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
