-- CreateTable
CREATE TABLE IF NOT EXISTS "amendment_apply_histories" (
    "id" TEXT NOT NULL,
    "executionBudgetId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amendment_apply_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "amendment_apply_histories_executionBudgetId_idx" ON "amendment_apply_histories"("executionBudgetId");

-- AddForeignKey
ALTER TABLE "amendment_apply_histories" ADD CONSTRAINT "amendment_apply_histories_executionBudgetId_fkey" FOREIGN KEY ("executionBudgetId") REFERENCES "execution_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
