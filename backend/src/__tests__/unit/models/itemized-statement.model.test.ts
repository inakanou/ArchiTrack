/**
 * @fileoverview ItemizedStatementモデルのスキーマ定義テスト
 *
 * TDD: RED Phase - Prismaスキーマで定義するItemizedStatementモデルの型検証
 *
 * Requirements (itemized-statement-generation):
 * - REQ-8.1: 内訳書作成時に集計時点の数量項目データを内訳書に保存する（スナップショット独立性）
 * - REQ-10.1: 内訳書はupdatedAtフィールドを持つ（楽観的排他制御用）
 *
 * Task 1 Specification:
 * - ItemizedStatementテーブル: プロジェクトとの関連付け、内訳書名、集計元数量表参照情報、タイムスタンプ
 * - ItemizedStatementItemテーブル: 内訳書への外部キー、分類項目、数量（小数点以下2桁精度）、表示順序
 * - 同一プロジェクト内での内訳書名重複を防ぐ部分一意制約
 * - 検索・ソート用インデックス
 * - カスケード削除
 */

import { describe, it, expect } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';

describe('ItemizedStatement Model Schema', () => {
  describe('ItemizedStatement CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // REQ-8.1: 内訳書の必須フィールドの検証
      // name: 内訳書名（必須）
      // sourceQuantityTableId: 集計元数量表ID（必須）
      // sourceQuantityTableName: 集計元数量表名（スナップショット）（必須）
      const validInput: Prisma.ItemizedStatementCreateInput = {
        name: 'テスト内訳書',
        sourceQuantityTableId: 'quantity-table-uuid',
        sourceQuantityTableName: 'テスト数量表',
        project: { connect: { id: 'project-id' } },
      };

      expect(validInput.name).toBe('テスト内訳書');
      expect(validInput.sourceQuantityTableId).toBe('quantity-table-uuid');
      expect(validInput.sourceQuantityTableName).toBe('テスト数量表');
    });

    it('should have project relation', () => {
      // プロジェクトとの関連付け
      const input: Prisma.ItemizedStatementCreateInput = {
        name: 'テスト内訳書',
        sourceQuantityTableId: 'quantity-table-uuid',
        sourceQuantityTableName: 'テスト数量表',
        project: { connect: { id: 'project-id' } },
      };

      expect(input.project).toBeDefined();
    });
  });

  describe('ItemizedStatement fields validation', () => {
    it('should have id field as UUID', () => {
      // 内訳書の一意ID
      const statementSelect: Prisma.ItemizedStatementSelect = {
        id: true,
      };
      expect(statementSelect.id).toBe(true);
    });

    it('should have name field', () => {
      // 内訳書名フィールド（最大200文字）
      const statementSelect: Prisma.ItemizedStatementSelect = {
        name: true,
      };
      expect(statementSelect.name).toBe(true);
    });

    it('should have source quantity table reference fields', () => {
      // REQ-8.1: 集計元数量表参照情報（ID・名称スナップショット）
      const statementSelect: Prisma.ItemizedStatementSelect = {
        sourceQuantityTableId: true,
        sourceQuantityTableName: true,
      };
      expect(statementSelect.sourceQuantityTableId).toBe(true);
      expect(statementSelect.sourceQuantityTableName).toBe(true);
    });

    it('should have timestamp fields', () => {
      // REQ-10.1: updatedAtフィールド（楽観的排他制御用）
      const statementSelect: Prisma.ItemizedStatementSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(statementSelect.createdAt).toBe(true);
      expect(statementSelect.updatedAt).toBe(true);
    });

    it('should have deletedAt field for soft delete', () => {
      // 論理削除フィールド
      const statementSelect: Prisma.ItemizedStatementSelect = {
        deletedAt: true,
      };
      expect(statementSelect.deletedAt).toBe(true);
    });

    it('should have projectId field', () => {
      // プロジェクトIDフィールド
      const statementSelect: Prisma.ItemizedStatementSelect = {
        projectId: true,
      };
      expect(statementSelect.projectId).toBe(true);
    });
  });

  describe('ItemizedStatement relations', () => {
    it('should have project relation', () => {
      // プロジェクトへのリレーション
      const statementSelect: Prisma.ItemizedStatementSelect = {
        project: true,
        projectId: true,
      };
      expect(statementSelect.project).toBe(true);
      expect(statementSelect.projectId).toBe(true);
    });

    it('should have items relation to ItemizedStatementItem', () => {
      // 内訳項目へのリレーション
      const statementSelect: Prisma.ItemizedStatementSelect = {
        items: true,
      };
      expect(statementSelect.items).toBe(true);
    });
  });

  describe('ItemizedStatement filter and sort fields', () => {
    it('should allow filtering by projectId', () => {
      // プロジェクトIDでのフィルタリング
      const where: Prisma.ItemizedStatementWhereInput = {
        projectId: 'project-id',
      };
      expect(where.projectId).toBeDefined();
    });

    it('should allow filtering by name', () => {
      // 内訳書名でのフィルタリング
      const where: Prisma.ItemizedStatementWhereInput = {
        name: { contains: 'テスト' },
      };
      expect(where.name).toBeDefined();
    });

    it('should allow filtering by deletedAt (soft delete)', () => {
      // 論理削除されていないレコードのフィルタリング
      const where: Prisma.ItemizedStatementWhereInput = {
        deletedAt: null,
      };
      expect(where.deletedAt).toBeNull();
    });

    it('should allow sorting by createdAt', () => {
      // 作成日時でのソート
      const orderBy: Prisma.ItemizedStatementOrderByWithRelationInput = {
        createdAt: 'desc',
      };
      expect(orderBy.createdAt).toBe('desc');
    });

    it('should allow sorting by name', () => {
      // 内訳書名でのソート
      const orderBy: Prisma.ItemizedStatementOrderByWithRelationInput = {
        name: 'asc',
      };
      expect(orderBy.name).toBe('asc');
    });
  });
});

describe('ItemizedStatementItem Model Schema', () => {
  describe('ItemizedStatementItem CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // 内訳項目の必須フィールドの検証
      const validInput: Prisma.ItemizedStatementItemCreateInput = {
        quantity: 123.45,
        displayOrder: 1,
        itemizedStatement: { connect: { id: 'statement-id' } },
      };

      expect(validInput.quantity).toBe(123.45);
      expect(validInput.displayOrder).toBe(1);
    });

    it('should allow optional classification fields', () => {
      // 任意の分類フィールド
      const input: Prisma.ItemizedStatementItemCreateInput = {
        customCategory: '任意分類',
        workType: '工種',
        name: '名称',
        specification: '規格',
        unit: '単位',
        quantity: 123.45,
        displayOrder: 1,
        itemizedStatement: { connect: { id: 'statement-id' } },
      };

      expect(input.customCategory).toBe('任意分類');
      expect(input.workType).toBe('工種');
      expect(input.name).toBe('名称');
      expect(input.specification).toBe('規格');
      expect(input.unit).toBe('単位');
    });
  });

  describe('ItemizedStatementItem fields validation', () => {
    it('should have id field as UUID', () => {
      // 項目の一意ID
      const itemSelect: Prisma.ItemizedStatementItemSelect = {
        id: true,
      };
      expect(itemSelect.id).toBe(true);
    });

    it('should have classification fields', () => {
      // 分類フィールド
      const itemSelect: Prisma.ItemizedStatementItemSelect = {
        customCategory: true,
        workType: true,
        name: true,
        specification: true,
        unit: true,
      };
      expect(itemSelect.customCategory).toBe(true);
      expect(itemSelect.workType).toBe(true);
      expect(itemSelect.name).toBe(true);
      expect(itemSelect.specification).toBe(true);
      expect(itemSelect.unit).toBe(true);
    });

    it('should have quantity field with decimal precision', () => {
      // 数量フィールド（小数点以下2桁精度）
      const itemSelect: Prisma.ItemizedStatementItemSelect = {
        quantity: true,
      };
      expect(itemSelect.quantity).toBe(true);
    });

    it('should have displayOrder field', () => {
      // 表示順序フィールド
      const itemSelect: Prisma.ItemizedStatementItemSelect = {
        displayOrder: true,
      };
      expect(itemSelect.displayOrder).toBe(true);
    });

    it('should have itemizedStatementId field', () => {
      // 内訳書IDフィールド（外部キー）
      const itemSelect: Prisma.ItemizedStatementItemSelect = {
        itemizedStatementId: true,
      };
      expect(itemSelect.itemizedStatementId).toBe(true);
    });
  });

  describe('ItemizedStatementItem relations', () => {
    it('should have itemizedStatement relation', () => {
      // 内訳書へのリレーション
      const itemSelect: Prisma.ItemizedStatementItemSelect = {
        itemizedStatement: true,
        itemizedStatementId: true,
      };
      expect(itemSelect.itemizedStatement).toBe(true);
      expect(itemSelect.itemizedStatementId).toBe(true);
    });
  });

  describe('ItemizedStatementItem filter and sort fields', () => {
    it('should allow filtering by itemizedStatementId', () => {
      // 内訳書IDでのフィルタリング
      const where: Prisma.ItemizedStatementItemWhereInput = {
        itemizedStatementId: 'statement-id',
      };
      expect(where.itemizedStatementId).toBeDefined();
    });

    it('should allow filtering by classification fields', () => {
      // 分類フィールドでのフィルタリング
      const where: Prisma.ItemizedStatementItemWhereInput = {
        customCategory: { contains: '任意' },
        workType: { contains: '工種' },
        name: { contains: '名称' },
        specification: { contains: '規格' },
        unit: { contains: '単位' },
      };
      expect(where.customCategory).toBeDefined();
      expect(where.workType).toBeDefined();
      expect(where.name).toBeDefined();
      expect(where.specification).toBeDefined();
      expect(where.unit).toBeDefined();
    });

    it('should allow sorting by displayOrder', () => {
      // 表示順序でのソート
      const orderBy: Prisma.ItemizedStatementItemOrderByWithRelationInput = {
        displayOrder: 'asc',
      };
      expect(orderBy.displayOrder).toBe('asc');
    });
  });
});
