-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('NEW', 'AMENDMENT');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('BEFORE_CONTRACT', 'CONTRACTED');

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'BEFORE_CONTRACT',
    "parentContractId" TEXT,
    "estimateId" TEXT,
    "contractDate" DATE NOT NULL,
    "constructionStartDate" DATE NOT NULL,
    "constructionEndDate" DATE NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "paymentTerms" TEXT NOT NULL DEFAULT '',
    "separateConstruction" TEXT NOT NULL DEFAULT '',
    "otherNotes" TEXT NOT NULL DEFAULT '',
    "supervisorTradingPartnerId" TEXT,
    "contractAmount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "constructionPrice" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_projectId_idx" ON "contracts"("projectId");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "contracts_contractDate_idx" ON "contracts"("contractDate");

-- CreateIndex
CREATE INDEX "contracts_deletedAt_idx" ON "contracts"("deletedAt");

-- CreateIndex
CREATE INDEX "contracts_parentContractId_idx" ON "contracts"("parentContractId");

-- CreateIndex
CREATE INDEX "contracts_estimateId_idx" ON "contracts"("estimateId");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_parentContractId_fkey" FOREIGN KEY ("parentContractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_supervisorTradingPartnerId_fkey" FOREIGN KEY ("supervisorTradingPartnerId") REFERENCES "trading_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
