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

    it('should have id as UUID primary key with default', () => {
      expect(migrationSql).toMatch(/"id" UUID NOT NULL DEFAULT gen_random_uuid\(\)/);
    });

    it('should have project_id as non-nullable UUID', () => {
      expect(migrationSql).toMatch(/"project_id" UUID NOT NULL/);
    });

    it('should have name field', () => {
      expect(migrationSql).toMatch(/"name" VARCHAR\(200\) NOT NULL/);
    });

    it('should have quantity_table_id as nullable UUID', () => {
      // 数量表連携は任意
      expect(migrationSql).toMatch(/"quantity_table_id" UUID[^,]*,/);
      // NOT NULLが含まれないこと
      const quantityTableLine = migrationSql
        .split('\n')
        .find((line) => line.includes('"quantity_table_id"'));
      expect(quantityTableLine).toBeDefined();
      expect(quantityTableLine).not.toContain('NOT NULL');
    });

    it('should have version with default 0', () => {
      expect(migrationSql).toMatch(/"version" INTEGER NOT NULL DEFAULT 0/);
    });

    it('should have timestamp fields', () => {
      expect(migrationSql).toMatch(
        /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/
      );
      expect(migrationSql).toMatch(/"updated_at" TIMESTAMPTZ\(3\) NOT NULL/);
    });

    it('should have nullable deleted_at for soft delete', () => {
      const deletedAtLine = migrationSql
        .split('\n')
        .find((line) => line.includes('"deleted_at"') && !line.includes('CREATE INDEX'));
      expect(deletedAtLine).toBeDefined();
      expect(deletedAtLine).not.toContain('NOT NULL');
    });

    it('should have project_id index', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "idx_construction_schedules_project_id" ON "construction_schedules"("project_id")'
      );
    });

    it('should have deleted_at index', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "idx_construction_schedules_deleted_at" ON "construction_schedules"("deleted_at")'
      );
    });

    it('should have foreign key to projects with CASCADE delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE'
      );
    });

    it('should have foreign key to quantity_tables with SET NULL delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("quantity_table_id") REFERENCES "quantity_tables"("id") ON DELETE SET NULL'
      );
    });
  });

  describe('schedule_items table', () => {
    it('should create the schedule_items table', () => {
      expect(migrationSql).toContain('CREATE TABLE "schedule_items"');
    });

    it('should have id as UUID primary key with default', () => {
      // schedule_itemsテーブル内のid
      const scheduleItemsSection = migrationSql.split('CREATE TABLE "schedule_items"')[1];
      expect(scheduleItemsSection).toBeDefined();
      expect(scheduleItemsSection).toContain('"id" UUID NOT NULL DEFAULT gen_random_uuid()');
    });

    it('should have schedule_id as non-nullable UUID', () => {
      expect(migrationSql).toMatch(/"schedule_id" UUID NOT NULL/);
    });

    it('should have source_type with default MANUAL', () => {
      // sourceTypeのデフォルト値 'MANUAL'
      expect(migrationSql).toMatch(/"source_type".*DEFAULT 'MANUAL'/);
    });

    it('should have source_quantity_item_id as nullable UUID', () => {
      const sourceQtyLine = migrationSql
        .split('\n')
        .find((line) => line.includes('"source_quantity_item_id"'));
      expect(sourceQtyLine).toBeDefined();
      expect(sourceQtyLine).not.toContain('NOT NULL');
    });

    it('should have item_name field', () => {
      expect(migrationSql).toMatch(/"item_name" VARCHAR\(500\) NOT NULL/);
    });

    it('should have label_text with empty string default', () => {
      expect(migrationSql).toMatch(/"label_text" VARCHAR\(200\) NOT NULL DEFAULT ''/);
    });

    it('should have detail_text with empty string default', () => {
      expect(migrationSql).toMatch(/"detail_text" VARCHAR\(500\) NOT NULL DEFAULT ''/);
    });

    it('should have nullable start_date as DATE type', () => {
      const startDateLine = migrationSql.split('\n').find((line) => line.includes('"start_date"'));
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

    it('should have display_order with default 0', () => {
      expect(migrationSql).toMatch(/"display_order" INTEGER NOT NULL DEFAULT 0/);
    });

    it('should have is_export_target with default true', () => {
      // REQ-9.2: デフォルト値はtrue
      expect(migrationSql).toMatch(/"is_export_target" BOOLEAN NOT NULL DEFAULT true/);
    });

    it('should have schedule_id index', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "idx_schedule_items_schedule_id" ON "schedule_items"("schedule_id")'
      );
    });

    it('should have composite index on schedule_id and display_order', () => {
      expect(migrationSql).toContain(
        'CREATE INDEX "idx_schedule_items_display_order" ON "schedule_items"("schedule_id", "display_order")'
      );
    });

    it('should have foreign key to construction_schedules with CASCADE delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("schedule_id") REFERENCES "construction_schedules"("id") ON DELETE CASCADE'
      );
    });

    it('should have foreign key to quantity_items with SET NULL delete', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("source_quantity_item_id") REFERENCES "quantity_items"("id") ON DELETE SET NULL'
      );
    });
  });
});
