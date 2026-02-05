-- CreateEnum
CREATE TYPE "EstimateItemLineType" AS ENUM ('ESTIMATE', 'EXECUTION', 'VENDOR');

-- CreateTable
CREATE TABLE "estimates" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceItemizedStatementId" TEXT,
    "sourceItemizedStatementName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_items" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "parentId" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_item_lines" (
    "id" TEXT NOT NULL,
    "estimateItemId" TEXT NOT NULL,
    "lineType" "EstimateItemLineType" NOT NULL,
    "name" TEXT,
    "specification" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(15,4),
    "unitPrice" DECIMAL(15,2),
    "amount" DECIMAL(15,2),
    "remarks" TEXT,
    "sourceReceivedQuotationLineItemId" TEXT,
    "sourceVendorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_item_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimates_projectId_idx" ON "estimates"("projectId");

-- CreateIndex
CREATE INDEX "estimates_deletedAt_idx" ON "estimates"("deletedAt");

-- CreateIndex
CREATE INDEX "estimates_createdAt_idx" ON "estimates"("createdAt");

-- CreateIndex
CREATE INDEX "estimate_items_estimateId_idx" ON "estimate_items"("estimateId");

-- CreateIndex
CREATE INDEX "estimate_items_parentId_idx" ON "estimate_items"("parentId");

-- CreateIndex
CREATE INDEX "estimate_items_estimateId_displayOrder_idx" ON "estimate_items"("estimateId", "displayOrder");

-- CreateIndex
CREATE INDEX "estimate_item_lines_estimateItemId_idx" ON "estimate_item_lines"("estimateItemId");

-- CreateIndex
CREATE INDEX "estimate_item_lines_lineType_idx" ON "estimate_item_lines"("lineType");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_item_lines_estimateItemId_lineType_key" ON "estimate_item_lines"("estimateItemId", "lineType");

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "estimate_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_item_lines" ADD CONSTRAINT "estimate_item_lines_estimateItemId_fkey" FOREIGN KEY ("estimateItemId") REFERENCES "estimate_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
