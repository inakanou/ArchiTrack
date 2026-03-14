/**
 * @fileoverview ConstructionSchedule マイグレーションファイルの内容検証テスト
 *
 * TDD: マイグレーションSQLが設計仕様に沿った内容であることを検証する。
 *
 * Requirements (construction-schedule):
 * - REQ-1.3: 工程表保存（テーブル作成）
 * - REQ-9.2: isExportTargetのデフォルト値true
 *
 * Task 1.2 Specification:
 * - construction_schedulesテーブルとschedule_itemsテーブルの作成マイグレーション
 * - 外部キー制約（ON DELETE CASCADE、ON DELETE SET NULL）の設定
 * - isExportTargetのデフォルト値true、sourceTypeのデフォルト値'MANUAL'を設定
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const migrationDir = resolve(
  __dirname,
  '../../../../prisma/migrations/20260314100000_add_construction_schedule_models'
);
const migrationSql = readFileSync(resolve(migrationDir, 'migration.sql'), 'utf-8');

describe('Construction Schedule Migration', () => {
  describe('construction_schedules table', () => {
    it('should create the construction_schedules table', () => {
      expect(migrationSql).toContain('CREATE TABLE "construction_schedules"');
    });

    it('should have id as TEXT primary key', () => {
      expect(migrationSql).toContain('"id" TEXT NOT NULL');
    });

    it('should have projectId as non-nullable TEXT', () => {
      expect(migrationSql).toContain('"projectId" TEXT NOT NULL');
    });

    it('should have name field', () => {
      expect(migrationSql).toContain('"name" TEXT NOT NULL');
    });

    it('should have quantityTableId as nullable TEXT', () => {
      const quantityTableLine = migrationSql
        .split('\n')
        .find((line) => line.includes('"quantityTableId"'));
      expect(quantityTableLine).toBeDefined();
      expect(quantityTableLine).not.toContain('NOT NULL');
    });

    it('should have version with default 0', () => {
      expect(migrationSql).toContain('"version" INTEGER NOT NULL DEFAULT 0');
    });

    it('should have timestamp fields', () => {
      expect(migrationSql).toContain('"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP');
      expect(migrationSql).toContain('"updatedAt" TIMESTAMP(3) NOT NULL');
    });

    it('should have nullable deletedAt for soft delete', () => {
      const deletedAtLine = migrationSql
        .split('\n')
        .find((line) => line.includes('"deletedAt"') && !line.includes('CREATE INDEX'));
      expect(deletedAtLine).toBeDefined();
      expect(deletedAtLine).not.toContain('NOT NULL');
    });

    it('should have projectId index', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "construction_schedules_projectId_idx" ON "construction_schedules"("projectId")'
      );
    });

    it('should have deletedAt index', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "construction_schedules_deletedAt_idx" ON "construction_schedules"("deletedAt")'
      );
    });

    it('should have foreign key to projects with CASCADE delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE'
      );
    });

    it('should have foreign key to quantity_tables with SET NULL delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("quantityTableId") REFERENCES "quantity_tables"("id") ON DELETE SET NULL'
      );
    });
  });

  describe('schedule_items table', () => {
    it('should create the schedule_items table', () => {
      expect(migrationSql).toContain('CREATE TABLE "schedule_items"');
    });

    it('should have id as TEXT primary key', () => {
      // schedule_itemsテーブル内のid
      const scheduleItemsSection = migrationSql.split('CREATE TABLE "schedule_items"')[1];
      expect(scheduleItemsSection).toBeDefined();
      expect(scheduleItemsSection).toContain('"id" TEXT NOT NULL');
    });

    it('should have scheduleId as non-nullable TEXT', () => {
      expect(migrationSql).toContain('"scheduleId" TEXT NOT NULL');
    });

    it('should have sourceType with default MANUAL', () => {
      // sourceTypeのデフォルト値 'MANUAL'
      expect(migrationSql).toMatch(/"sourceType".*DEFAULT 'MANUAL'/);
    });

    it('should have sourceQuantityItemId as nullable TEXT', () => {
      const sourceQtyLine = migrationSql
        .split('\n')
        .find((line) => line.includes('"sourceQuantityItemId"'));
      expect(sourceQtyLine).toBeDefined();
      expect(sourceQtyLine).not.toContain('NOT NULL');
    });

    it('should have itemName field', () => {
      expect(migrationSql).toContain('"itemName" TEXT NOT NULL');
    });

    it('should have labelText with empty string default', () => {
      expect(migrationSql).toContain('"labelText" TEXT NOT NULL DEFAULT \'\'');
    });

    it('should have detailText with empty string default', () => {
      expect(migrationSql).toContain('"detailText" TEXT NOT NULL DEFAULT \'\'');
    });

    it('should have nullable startDate as DATE type', () => {
      const startDateLine = migrationSql.split('\n').find((line) => line.includes('"startDate"'));
      expect(startDateLine).toBeDefined();
      expect(startDateLine).toContain('DATE');
      expect(startDateLine).not.toContain('NOT NULL');
    });

    it('should have nullable duration as INTEGER', () => {
      const durationLine = migrationSql.split('\n').find((line) => line.includes('"duration"'));
      expect(durationLine).toBeDefined();
      expect(durationLine).toContain('INTEGER');
      expect(durationLine).not.toContain('NOT NULL');
    });

    it('should have displayOrder with default 0', () => {
      expect(migrationSql).toContain('"displayOrder" INTEGER NOT NULL DEFAULT 0');
    });

    it('should have isExportTarget with default true', () => {
      // REQ-9.2: デフォルト値はtrue
      expect(migrationSql).toContain('"isExportTarget" BOOLEAN NOT NULL DEFAULT true');
    });

    it('should have scheduleId index', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "schedule_items_scheduleId_idx" ON "schedule_items"("scheduleId")'
      );
    });

    it('should have composite index on scheduleId and displayOrder', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "schedule_items_scheduleId_displayOrder_idx" ON "schedule_items"("scheduleId", "displayOrder")'
      );
    });

    it('should have foreign key to construction_schedules with CASCADE delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("scheduleId") REFERENCES "construction_schedules"("id") ON DELETE CASCADE'
      );
    });

    it('should have foreign key to quantity_items with SET NULL delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("sourceQuantityItemId") REFERENCES "quantity_items"("id") ON DELETE SET NULL'
      );
    });
  });
});
