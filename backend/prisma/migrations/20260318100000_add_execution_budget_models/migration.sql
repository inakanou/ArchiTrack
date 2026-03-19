-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('BEFORE_ORDER', 'UNDER_REVIEW', 'ORDERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AmendmentStatus" AS ENUM ('AMENDMENT_DELETED');

-- CreateTable
CREATE TABLE "execution_budgets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "execution_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_budget_items" (
    "id" TEXT NOT NULL,
    "executionBudgetId" TEXT NOT NULL,
    "estimateItemId" TEXT,
    "parentId" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "name" TEXT,
    "specification" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(15,4),
    "estimateUnitPrice" DECIMAL(15,2),
    "estimateAmount" DECIMAL(15,0),
    "executionUnitPrice" DECIMAL(15,2),
    "executionAmount" DECIMAL(15,0),
    "amendmentAmount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "previousMonthExpense" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "currentMonthExpense" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "plannedVendorId" TEXT,
    "amendmentStatus" "AmendmentStatus",
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "execution_budget_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "executionBudgetId" TEXT NOT NULL,
    "tradingPartnerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'BEFORE_ORDER',
    "confirmedAmount" DECIMAL(15,0),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "executionBudgetItemId" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "orderAmount" DECIMAL(15,0),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_records" (
    "id" TEXT NOT NULL,
    "executionBudgetId" TEXT NOT NULL,
    "constructionDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_record_items" (
    "id" TEXT NOT NULL,
    "progressRecordId" TEXT NOT NULL,
    "executionBudgetItemId" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_record_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_close_histories" (
    "id" TEXT NOT NULL,
    "executionBudgetId" TEXT NOT NULL,
    "targetMonth" TEXT NOT NULL,
    "closedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_close_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "execution_budgets_projectId_key" ON "execution_budgets"("projectId");

-- CreateIndex
CREATE INDEX "execution_budgets_contractId_idx" ON "execution_budgets"("contractId");

-- CreateIndex
CREATE INDEX "execution_budget_items_executionBudgetId_idx" ON "execution_budget_items"("executionBudgetId");

-- CreateIndex
CREATE INDEX "execution_budget_items_parentId_idx" ON "execution_budget_items"("parentId");

-- CreateIndex
CREATE INDEX "execution_budget_items_estimateItemId_idx" ON "execution_budget_items"("estimateItemId");

-- CreateIndex
CREATE INDEX "execution_budget_items_plannedVendorId_idx" ON "execution_budget_items"("plannedVendorId");

-- CreateIndex
CREATE INDEX "orders_executionBudgetId_idx" ON "orders"("executionBudgetId");

-- CreateIndex
CREATE INDEX "orders_tradingPartnerId_idx" ON "orders"("tradingPartnerId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_orderId_executionBudgetItemId_key" ON "order_items"("orderId", "executionBudgetItemId");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_executionBudgetItemId_idx" ON "order_items"("executionBudgetItemId");

-- CreateIndex
CREATE UNIQUE INDEX "progress_records_executionBudgetId_constructionDate_key" ON "progress_records"("executionBudgetId", "constructionDate");

-- CreateIndex
CREATE INDEX "progress_records_executionBudgetId_idx" ON "progress_records"("executionBudgetId");

-- CreateIndex
CREATE UNIQUE INDEX "progress_record_items_progressRecordId_executionBudgetItemId_key" ON "progress_record_items"("progressRecordId", "executionBudgetItemId");

-- CreateIndex
CREATE INDEX "progress_record_items_progressRecordId_idx" ON "progress_record_items"("progressRecordId");

-- CreateIndex
CREATE INDEX "progress_record_items_executionBudgetItemId_idx" ON "progress_record_items"("executionBudgetItemId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_close_histories_executionBudgetId_targetMonth_key" ON "monthly_close_histories"("executionBudgetId", "targetMonth");

-- CreateIndex
CREATE INDEX "monthly_close_histories_executionBudgetId_idx" ON "monthly_close_histories"("executionBudgetId");

-- AddForeignKey
ALTER TABLE "execution_budgets" ADD CONSTRAINT "execution_budgets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_budgets" ADD CONSTRAINT "execution_budgets_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_budget_items" ADD CONSTRAINT "execution_budget_items_executionBudgetId_fkey" FOREIGN KEY ("executionBudgetId") REFERENCES "execution_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_budget_items" ADD CONSTRAINT "execution_budget_items_estimateItemId_fkey" FOREIGN KEY ("estimateItemId") REFERENCES "estimate_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_budget_items" ADD CONSTRAINT "execution_budget_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "execution_budget_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_budget_items" ADD CONSTRAINT "execution_budget_items_plannedVendorId_fkey" FOREIGN KEY ("plannedVendorId") REFERENCES "trading_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_executionBudgetId_fkey" FOREIGN KEY ("executionBudgetId") REFERENCES "execution_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tradingPartnerId_fkey" FOREIGN KEY ("tradingPartnerId") REFERENCES "trading_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_executionBudgetItemId_fkey" FOREIGN KEY ("executionBudgetItemId") REFERENCES "execution_budget_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_records" ADD CONSTRAINT "progress_records_executionBudgetId_fkey" FOREIGN KEY ("executionBudgetId") REFERENCES "execution_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_record_items" ADD CONSTRAINT "progress_record_items_progressRecordId_fkey" FOREIGN KEY ("progressRecordId") REFERENCES "progress_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_record_items" ADD CONSTRAINT "progress_record_items_executionBudgetItemId_fkey" FOREIGN KEY ("executionBudgetItemId") REFERENCES "execution_budget_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_close_histories" ADD CONSTRAINT "monthly_close_histories_executionBudgetId_fkey" FOREIGN KEY ("executionBudgetId") REFERENCES "execution_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_close_histories" ADD CONSTRAINT "monthly_close_histories_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
