-- AlterTable
ALTER TABLE "execution_budget_items" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
