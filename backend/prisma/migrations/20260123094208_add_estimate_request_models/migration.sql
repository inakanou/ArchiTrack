-- CreateEnum
CREATE TYPE "EstimateRequestMethod" AS ENUM ('EMAIL', 'FAX');

-- CreateTable
CREATE TABLE "estimate_requests" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tradingPartnerId" TEXT NOT NULL,
    "itemizedStatementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" "EstimateRequestMethod" NOT NULL DEFAULT 'EMAIL',
    "includeBreakdownInBody" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "estimate_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_request_items" (
    "id" TEXT NOT NULL,
    "estimateRequestId" TEXT NOT NULL,
    "itemizedStatementItemId" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "estimate_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_requests_projectId_idx" ON "estimate_requests"("projectId");

-- CreateIndex
CREATE INDEX "estimate_requests_tradingPartnerId_idx" ON "estimate_requests"("tradingPartnerId");

-- CreateIndex
CREATE INDEX "estimate_requests_deletedAt_idx" ON "estimate_requests"("deletedAt");

-- CreateIndex
CREATE INDEX "estimate_requests_createdAt_idx" ON "estimate_requests"("createdAt");

-- CreateIndex
CREATE INDEX "estimate_request_items_estimateRequestId_idx" ON "estimate_request_items"("estimateRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_request_items_estimateRequestId_itemizedStatementI_key" ON "estimate_request_items"("estimateRequestId", "itemizedStatementItemId");

-- AddForeignKey
ALTER TABLE "estimate_requests" ADD CONSTRAINT "estimate_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_requests" ADD CONSTRAINT "estimate_requests_tradingPartnerId_fkey" FOREIGN KEY ("tradingPartnerId") REFERENCES "trading_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_requests" ADD CONSTRAINT "estimate_requests_itemizedStatementId_fkey" FOREIGN KEY ("itemizedStatementId") REFERENCES "itemized_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_request_items" ADD CONSTRAINT "estimate_request_items_estimateRequestId_fkey" FOREIGN KEY ("estimateRequestId") REFERENCES "estimate_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_request_items" ADD CONSTRAINT "estimate_request_items_itemizedStatementItemId_fkey" FOREIGN KEY ("itemizedStatementItemId") REFERENCES "itemized_statement_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
