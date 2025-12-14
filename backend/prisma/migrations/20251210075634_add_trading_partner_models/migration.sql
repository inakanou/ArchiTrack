-- CreateEnum
CREATE TYPE "TradingPartnerType" AS ENUM ('CUSTOMER', 'SUBCONTRACTOR');

-- CreateTable
CREATE TABLE "trading_partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKana" TEXT NOT NULL,
    "branchName" TEXT,
    "branchNameKana" TEXT,
    "representativeName" TEXT,
    "representativeNameKana" TEXT,
    "address" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "faxNumber" TEXT,
    "email" TEXT,
    "billingClosingDay" INTEGER,
    "paymentMonthOffset" INTEGER,
    "paymentDay" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "trading_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading_partner_type_mappings" (
    "id" TEXT NOT NULL,
    "tradingPartnerId" TEXT NOT NULL,
    "type" "TradingPartnerType" NOT NULL,

    CONSTRAINT "trading_partner_type_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trading_partners_nameKana_idx" ON "trading_partners"("nameKana");

-- CreateIndex
CREATE INDEX "trading_partners_deletedAt_idx" ON "trading_partners"("deletedAt");

-- CreateIndex
CREATE INDEX "trading_partners_createdAt_idx" ON "trading_partners"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "trading_partners_name_deletedAt_key" ON "trading_partners"("name", "deletedAt");

-- CreateIndex
CREATE INDEX "trading_partner_type_mappings_tradingPartnerId_idx" ON "trading_partner_type_mappings"("tradingPartnerId");

-- CreateIndex
CREATE INDEX "trading_partner_type_mappings_type_idx" ON "trading_partner_type_mappings"("type");

-- CreateIndex
CREATE UNIQUE INDEX "trading_partner_type_mappings_tradingPartnerId_type_key" ON "trading_partner_type_mappings"("tradingPartnerId", "type");

-- AddForeignKey
ALTER TABLE "trading_partner_type_mappings" ADD CONSTRAINT "trading_partner_type_mappings_tradingPartnerId_fkey" FOREIGN KEY ("tradingPartnerId") REFERENCES "trading_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
