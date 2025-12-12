-- RemoveKanaFieldsFromTradingPartner
-- Remove branchNameKana and representativeNameKana columns from trading_partners table
-- These fields were determined to be unnecessary as per design review

-- AlterTable
ALTER TABLE "trading_partners" DROP COLUMN "branchNameKana";
ALTER TABLE "trading_partners" DROP COLUMN "representativeNameKana";
