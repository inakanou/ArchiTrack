/**
 * @fileoverview ExecutionBudget マイグレーションファイルの内容検証テスト
 *
 * TDD: マイグレーションSQLが設計仕様に沿った内容であることを検証する。
 *
 * Requirements (execution-budget-management):
 * - REQ-19.1: 実行予算データをPostgreSQLデータベースに永続化する
 * - REQ-19.8: 実行予算の論理削除をサポートする
 *
 * Task 1.1 Specification:
 * - 7つのテーブルの作成マイグレーション
 * - OrderStatusとAmendmentStatusのenum型作成
 * - 外部キー制約（ON DELETE CASCADE、ON DELETE SET NULL、ON DELETE RESTRICT）の設定
 * - 金額フィールドにDecimal(15,0)、単価にDecimal(15,2)、数量にDecimal(15,4)
 * - 楽観的排他制御用のversionフィールド、論理削除用のdeletedAtフィールド
 * - ユニーク制約、インデックス定義
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const migrationDir = resolve(
  __dirname,
  '../../../../prisma/migrations/20260318100000_add_execution_budget_models'
);
const migrationSql = readFileSync(resolve(migrationDir, 'migration.sql'), 'utf-8');

describe('Execution Budget Migration', () => {
  // ===== Enum Definitions =====

  describe('OrderStatus enum', () => {
    it('should create the OrderStatus enum with 4 values', () => {
      expect(migrationSql).toContain(
        "CREATE TYPE \"OrderStatus\" AS ENUM ('BEFORE_ORDER', 'UNDER_REVIEW', 'ORDERED', 'CANCELLED')"
      );
    });
  });

  describe('AmendmentStatus enum', () => {
    it('should create the AmendmentStatus enum', () => {
      expect(migrationSql).toContain(
        'CREATE TYPE "AmendmentStatus" AS ENUM (\'AMENDMENT_DELETED\')'
      );
    });
  });

  // ===== execution_budgets table =====

  describe('execution_budgets table', () => {
    it('should create the execution_budgets table', () => {
      expect(migrationSql).toContain('CREATE TABLE "execution_budgets"');
    });

    it('should have id as TEXT primary key', () => {
      expect(migrationSql).toContain('"id" TEXT NOT NULL');
    });

    it('should have projectId as non-nullable TEXT', () => {
      const section = migrationSql.split('CREATE TABLE "execution_budgets"')[1];
      expect(section).toContain('"projectId" TEXT NOT NULL');
    });

    it('should have contractId as non-nullable TEXT', () => {
      const section = migrationSql.split('CREATE TABLE "execution_budgets"')[1];
      expect(section).toContain('"contractId" TEXT NOT NULL');
    });

    it('should have version with default 0', () => {
      expect(migrationSql).toContain('"version" INTEGER NOT NULL DEFAULT 0');
    });

    it('should have timestamp fields', () => {
      expect(migrationSql).toContain('"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP');
      expect(migrationSql).toContain('"updatedAt" TIMESTAMP(3) NOT NULL');
    });

    it('should have nullable deletedAt for soft delete', () => {
      const section = migrationSql
        .split('CREATE TABLE "execution_budgets"')[1]
        ?.split('CREATE TABLE')[0];
      expect(section).toBeDefined();
      const deletedAtLine = section!.split('\n').find((line) => line.includes('"deletedAt"'));
      expect(deletedAtLine).toBeDefined();
      expect(deletedAtLine).not.toContain('NOT NULL');
    });

    it('should have UNIQUE index on projectId', () => {
      expect(migrationSql).toContain(
        'CREATE UNIQUE INDEX "execution_budgets_projectId_key" ON "execution_budgets"("projectId")'
      );
    });

    it('should have contractId index', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "execution_budgets_contractId_idx" ON "execution_budgets"("contractId")'
      );
    });

    it('should have foreign key to projects with CASCADE delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE'
      );
    });

    it('should have foreign key to contracts with RESTRICT delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT'
      );
    });
  });

  // ===== execution_budget_items table =====

  describe('execution_budget_items table', () => {
    it('should create the execution_budget_items table', () => {
      expect(migrationSql).toContain('CREATE TABLE "execution_budget_items"');
    });

    it('should have executionBudgetId as non-nullable TEXT', () => {
      const section = migrationSql.split('CREATE TABLE "execution_budget_items"')[1];
      expect(section).toContain('"executionBudgetId" TEXT NOT NULL');
    });

    it('should have nullable estimateItemId', () => {
      const section = migrationSql
        .split('CREATE TABLE "execution_budget_items"')[1]
        ?.split('CREATE TABLE')[0];
      const line = section!.split('\n').find((l) => l.includes('"estimateItemId"'));
      expect(line).toBeDefined();
      expect(line).not.toContain('NOT NULL');
    });

    it('should have nullable parentId for hierarchy', () => {
      const section = migrationSql
        .split('CREATE TABLE "execution_budget_items"')[1]
        ?.split('CREATE TABLE')[0];
      const line = section!.split('\n').find((l) => l.includes('"parentId"'));
      expect(line).toBeDefined();
      expect(line).not.toContain('NOT NULL');
    });

    it('should have displayOrder as non-nullable INTEGER', () => {
      expect(migrationSql).toContain('"displayOrder" INTEGER NOT NULL');
    });

    it('should have quantity as Decimal(15,4)', () => {
      expect(migrationSql).toContain('"quantity" DECIMAL(15,4)');
    });

    it('should have estimateUnitPrice as Decimal(15,2)', () => {
      expect(migrationSql).toContain('"estimateUnitPrice" DECIMAL(15,2)');
    });

    it('should have estimateAmount as Decimal(15,0)', () => {
      const section = migrationSql
        .split('CREATE TABLE "execution_budget_items"')[1]
        ?.split('CREATE TABLE')[0];
      const line = section!.split('\n').find((l) => l.includes('"estimateAmount"'));
      expect(line).toBeDefined();
      expect(line).toContain('DECIMAL(15,0)');
    });

    it('should have executionUnitPrice as Decimal(15,2)', () => {
      expect(migrationSql).toContain('"executionUnitPrice" DECIMAL(15,2)');
    });

    it('should have executionAmount as Decimal(15,0)', () => {
      const section = migrationSql
        .split('CREATE TABLE "execution_budget_items"')[1]
        ?.split('CREATE TABLE')[0];
      const line = section!.split('\n').find((l) => l.includes('"executionAmount"'));
      expect(line).toBeDefined();
      expect(line).toContain('DECIMAL(15,0)');
    });

    it('should have amendmentAmount with default 0 as Decimal(15,0)', () => {
      expect(migrationSql).toContain('"amendmentAmount" DECIMAL(15,0) NOT NULL DEFAULT 0');
    });

    it('should have previousMonthExpense with default 0 as Decimal(15,0)', () => {
      expect(migrationSql).toContain('"previousMonthExpense" DECIMAL(15,0) NOT NULL DEFAULT 0');
    });

    it('should have currentMonthExpense with default 0 as Decimal(15,0)', () => {
      expect(migrationSql).toContain('"currentMonthExpense" DECIMAL(15,0) NOT NULL DEFAULT 0');
    });

    it('should have nullable amendmentStatus enum', () => {
      const section = migrationSql
        .split('CREATE TABLE "execution_budget_items"')[1]
        ?.split('CREATE TABLE')[0];
      const line = section!.split('\n').find((l) => l.includes('"amendmentStatus"'));
      expect(line).toBeDefined();
      expect(line).toContain('"AmendmentStatus"');
      expect(line).not.toContain('NOT NULL');
    });

    it('should have indexes on executionBudgetId, parentId, estimateItemId, plannedVendorId', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "execution_budget_items_executionBudgetId_idx" ON "execution_budget_items"("executionBudgetId")'
      );
      expect(migrationSql).toContain(
        'CREATE INDEX "execution_budget_items_parentId_idx" ON "execution_budget_items"("parentId")'
      );
      expect(migrationSql).toContain(
        'CREATE INDEX "execution_budget_items_estimateItemId_idx" ON "execution_budget_items"("estimateItemId")'
      );
      expect(migrationSql).toContain(
        'CREATE INDEX "execution_budget_items_plannedVendorId_idx" ON "execution_budget_items"("plannedVendorId")'
      );
    });

    it('should have foreign key to execution_budgets with CASCADE delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("executionBudgetId") REFERENCES "execution_budgets"("id") ON DELETE CASCADE'
      );
    });

    it('should have foreign key to estimate_items with SET NULL delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("estimateItemId") REFERENCES "estimate_items"("id") ON DELETE SET NULL'
      );
    });

    it('should have self-referencing foreign key on parentId with CASCADE delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("parentId") REFERENCES "execution_budget_items"("id") ON DELETE CASCADE'
      );
    });

    it('should have foreign key to trading_partners on plannedVendorId with SET NULL delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("plannedVendorId") REFERENCES "trading_partners"("id") ON DELETE SET NULL'
      );
    });
  });

  // ===== orders table =====

  describe('orders table', () => {
    it('should create the orders table', () => {
      expect(migrationSql).toContain('CREATE TABLE "orders"');
    });

    it('should have status with default BEFORE_ORDER', () => {
      expect(migrationSql).toContain('"status" "OrderStatus" NOT NULL DEFAULT \'BEFORE_ORDER\'');
    });

    it('should have nullable confirmedAmount as Decimal(15,0)', () => {
      const section = migrationSql.split('CREATE TABLE "orders"')[1]?.split('CREATE TABLE')[0];
      const line = section!.split('\n').find((l) => l.includes('"confirmedAmount"'));
      expect(line).toBeDefined();
      expect(line).toContain('DECIMAL(15,0)');
      expect(line).not.toContain('NOT NULL');
    });

    it('should have version with default 0', () => {
      // Already tested globally, but verify in context
      const section = migrationSql.split('CREATE TABLE "orders"')[1]?.split('CREATE TABLE')[0];
      expect(section).toContain('"version" INTEGER NOT NULL DEFAULT 0');
    });

    it('should have nullable deletedAt for soft delete', () => {
      const section = migrationSql.split('CREATE TABLE "orders"')[1]?.split('CREATE TABLE')[0];
      const line = section!.split('\n').find((l) => l.includes('"deletedAt"'));
      expect(line).toBeDefined();
      expect(line).not.toContain('NOT NULL');
    });

    it('should have indexes on executionBudgetId, tradingPartnerId, status', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "orders_executionBudgetId_idx" ON "orders"("executionBudgetId")'
      );
      expect(migrationSql).toContain(
        'CREATE INDEX "orders_tradingPartnerId_idx" ON "orders"("tradingPartnerId")'
      );
      expect(migrationSql).toContain('CREATE INDEX "orders_status_idx" ON "orders"("status")');
    });

    it('should have foreign key to execution_budgets with CASCADE delete', () => {
      expect(migrationSql).toContain(
        '"orders_executionBudgetId_fkey" FOREIGN KEY ("executionBudgetId") REFERENCES "execution_budgets"("id") ON DELETE CASCADE'
      );
    });

    it('should have foreign key to trading_partners with RESTRICT delete', () => {
      expect(migrationSql).toContain(
        '"orders_tradingPartnerId_fkey" FOREIGN KEY ("tradingPartnerId") REFERENCES "trading_partners"("id") ON DELETE RESTRICT'
      );
    });
  });

  // ===== order_items table =====

  describe('order_items table', () => {
    it('should create the order_items table', () => {
      expect(migrationSql).toContain('CREATE TABLE "order_items"');
    });

    it('should have checked with default false', () => {
      expect(migrationSql).toContain('"checked" BOOLEAN NOT NULL DEFAULT false');
    });

    it('should have nullable orderAmount as Decimal(15,0)', () => {
      const section = migrationSql.split('CREATE TABLE "order_items"')[1]?.split('CREATE TABLE')[0];
      const line = section!.split('\n').find((l) => l.includes('"orderAmount"'));
      expect(line).toBeDefined();
      expect(line).toContain('DECIMAL(15,0)');
      expect(line).not.toContain('NOT NULL');
    });

    it('should have unique constraint on orderId + executionBudgetItemId', () => {
      expect(migrationSql).toContain(
        'CREATE UNIQUE INDEX "order_items_orderId_executionBudgetItemId_key" ON "order_items"("orderId", "executionBudgetItemId")'
      );
    });

    it('should have indexes on orderId and executionBudgetItemId', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId")'
      );
      expect(migrationSql).toContain(
        'CREATE INDEX "order_items_executionBudgetItemId_idx" ON "order_items"("executionBudgetItemId")'
      );
    });

    it('should have foreign key to orders with CASCADE delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE'
      );
    });

    it('should have foreign key to execution_budget_items with RESTRICT delete', () => {
      expect(migrationSql).toContain(
        '"order_items_executionBudgetItemId_fkey" FOREIGN KEY ("executionBudgetItemId") REFERENCES "execution_budget_items"("id") ON DELETE RESTRICT'
      );
    });
  });

  // ===== progress_records table =====

  describe('progress_records table', () => {
    it('should create the progress_records table', () => {
      expect(migrationSql).toContain('CREATE TABLE "progress_records"');
    });

    it('should have constructionDate as DATE type', () => {
      expect(migrationSql).toContain('"constructionDate" DATE NOT NULL');
    });

    it('should have unique constraint on executionBudgetId + constructionDate', () => {
      expect(migrationSql).toContain(
        'CREATE UNIQUE INDEX "progress_records_executionBudgetId_constructionDate_key" ON "progress_records"("executionBudgetId", "constructionDate")'
      );
    });

    it('should have executionBudgetId index', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "progress_records_executionBudgetId_idx" ON "progress_records"("executionBudgetId")'
      );
    });

    it('should have foreign key to execution_budgets with CASCADE delete', () => {
      expect(migrationSql).toContain(
        '"progress_records_executionBudgetId_fkey" FOREIGN KEY ("executionBudgetId") REFERENCES "execution_budgets"("id") ON DELETE CASCADE'
      );
    });
  });

  // ===== progress_record_items table =====

  describe('progress_record_items table', () => {
    it('should create the progress_record_items table', () => {
      expect(migrationSql).toContain('CREATE TABLE "progress_record_items"');
    });

    it('should have amount with default 0 as Decimal(15,0)', () => {
      expect(migrationSql).toContain('"amount" DECIMAL(15,0) NOT NULL DEFAULT 0');
    });

    it('should have unique constraint on progressRecordId + executionBudgetItemId', () => {
      expect(migrationSql).toContain(
        'CREATE UNIQUE INDEX "progress_record_items_progressRecordId_executionBudgetItemId_key" ON "progress_record_items"("progressRecordId", "executionBudgetItemId")'
      );
    });

    it('should have indexes on progressRecordId and executionBudgetItemId', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "progress_record_items_progressRecordId_idx" ON "progress_record_items"("progressRecordId")'
      );
      expect(migrationSql).toContain(
        'CREATE INDEX "progress_record_items_executionBudgetItemId_idx" ON "progress_record_items"("executionBudgetItemId")'
      );
    });

    it('should have foreign key to progress_records with CASCADE delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("progressRecordId") REFERENCES "progress_records"("id") ON DELETE CASCADE'
      );
    });

    it('should have foreign key to execution_budget_items with RESTRICT delete', () => {
      expect(migrationSql).toContain(
        '"progress_record_items_executionBudgetItemId_fkey" FOREIGN KEY ("executionBudgetItemId") REFERENCES "execution_budget_items"("id") ON DELETE RESTRICT'
      );
    });
  });

  // ===== monthly_close_histories table =====

  describe('monthly_close_histories table', () => {
    it('should create the monthly_close_histories table', () => {
      expect(migrationSql).toContain('CREATE TABLE "monthly_close_histories"');
    });

    it('should have targetMonth as TEXT', () => {
      const section = migrationSql.split('CREATE TABLE "monthly_close_histories"')[1];
      expect(section).toContain('"targetMonth" TEXT NOT NULL');
    });

    it('should have closedById as non-nullable TEXT', () => {
      const section = migrationSql.split('CREATE TABLE "monthly_close_histories"')[1];
      expect(section).toContain('"closedById" TEXT NOT NULL');
    });

    it('should have closedAt with default CURRENT_TIMESTAMP', () => {
      expect(migrationSql).toContain('"closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP');
    });

    it('should have unique constraint on executionBudgetId + targetMonth', () => {
      expect(migrationSql).toContain(
        'CREATE UNIQUE INDEX "monthly_close_histories_executionBudgetId_targetMonth_key" ON "monthly_close_histories"("executionBudgetId", "targetMonth")'
      );
    });

    it('should have executionBudgetId index', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "monthly_close_histories_executionBudgetId_idx" ON "monthly_close_histories"("executionBudgetId")'
      );
    });

    it('should have foreign key to execution_budgets with CASCADE delete', () => {
      expect(migrationSql).toContain(
        '"monthly_close_histories_executionBudgetId_fkey" FOREIGN KEY ("executionBudgetId") REFERENCES "execution_budgets"("id") ON DELETE CASCADE'
      );
    });

    it('should have foreign key to users with RESTRICT delete', () => {
      expect(migrationSql).toContain(
        '"monthly_close_histories_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE RESTRICT'
      );
    });
  });
});
