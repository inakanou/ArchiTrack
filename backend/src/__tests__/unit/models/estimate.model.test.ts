/**
 * @fileoverview Estimate（見積書）モデルのスキーマ定義テスト
 *
 * TDD: RED Phase - Prismaスキーマで定義するEstimateモデルの型検証
 *
 * Requirements (estimate-creation):
 * - REQ-1.1〜1.6: 見積書基本構造（タイトル行・見積項目行・合計行）
 * - REQ-2.1〜2.4: 見積項目ネスト構造（階層構造）
 * - REQ-11.4〜11.6: 見積書CRUD操作（更新・削除・名称設定）
 *
 * Task 1.1 Specification:
 * - Estimateテーブル（見積書マスター）: id, projectId, name, sourceItemizedStatementId, sourceItemizedStatementName, createdAt, updatedAt, deletedAt
 * - EstimateItemテーブル（見積項目、階層構造）: id, estimateId, parentId, displayOrder, createdAt, updatedAt
 * - EstimateItemLineテーブル（3行1セット）: id, estimateItemId, lineType, name, specification, unit, quantity, unitPrice, amount, remarks, sourceReceivedQuotationLineItemId, sourceVendorName
 * - 高精度10進数カラム（Decimal(15,2)、Decimal(15,4)）
 * - 外部キー制約とインデックス
 */

import { describe, it, expect } from 'vitest';
import type { Prisma, EstimateItemLineType } from '../../../generated/prisma/client.js';

describe('Estimate Model Schema', () => {
  describe('Estimate CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // REQ-11.5: 見積書の必須フィールドの検証
      // name: 見積書名（必須、最大200文字）
      const validInput: Prisma.EstimateCreateInput = {
        name: 'テスト見積書',
        project: { connect: { id: 'project-id' } },
      };

      expect(validInput.name).toBe('テスト見積書');
    });

    it('should allow optional source itemized statement reference', () => {
      // REQ-3.2: 内訳書選択時の参照情報（任意）
      const input: Prisma.EstimateCreateInput = {
        name: 'テスト見積書',
        sourceItemizedStatementId: 'itemized-statement-uuid',
        sourceItemizedStatementName: 'テスト内訳書',
        project: { connect: { id: 'project-id' } },
      };

      expect(input.sourceItemizedStatementId).toBe('itemized-statement-uuid');
      expect(input.sourceItemizedStatementName).toBe('テスト内訳書');
    });

    it('should have project relation', () => {
      // プロジェクトとの関連付け
      const input: Prisma.EstimateCreateInput = {
        name: 'テスト見積書',
        project: { connect: { id: 'project-id' } },
      };

      expect(input.project).toBeDefined();
    });
  });

  describe('Estimate fields validation', () => {
    it('should have id field as UUID', () => {
      // 見積書の一意ID
      const estimateSelect: Prisma.EstimateSelect = {
        id: true,
      };
      expect(estimateSelect.id).toBe(true);
    });

    it('should have name field', () => {
      // REQ-11.5: 見積書名フィールド（最大200文字）
      const estimateSelect: Prisma.EstimateSelect = {
        name: true,
      };
      expect(estimateSelect.name).toBe(true);
    });

    it('should have source itemized statement reference fields', () => {
      // REQ-3.2: 参照内訳書情報（ID・名称スナップショット）
      const estimateSelect: Prisma.EstimateSelect = {
        sourceItemizedStatementId: true,
        sourceItemizedStatementName: true,
      };
      expect(estimateSelect.sourceItemizedStatementId).toBe(true);
      expect(estimateSelect.sourceItemizedStatementName).toBe(true);
    });

    it('should have timestamp fields', () => {
      // REQ-11.6: updatedAtフィールド（楽観的排他制御用）
      const estimateSelect: Prisma.EstimateSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(estimateSelect.createdAt).toBe(true);
      expect(estimateSelect.updatedAt).toBe(true);
    });

    it('should have deletedAt field for soft delete', () => {
      // REQ-11.4: 論理削除フィールド
      const estimateSelect: Prisma.EstimateSelect = {
        deletedAt: true,
      };
      expect(estimateSelect.deletedAt).toBe(true);
    });

    it('should have projectId field', () => {
      // プロジェクトIDフィールド
      const estimateSelect: Prisma.EstimateSelect = {
        projectId: true,
      };
      expect(estimateSelect.projectId).toBe(true);
    });
  });

  describe('Estimate relations', () => {
    it('should have project relation', () => {
      // プロジェクトへのリレーション
      const estimateSelect: Prisma.EstimateSelect = {
        project: true,
        projectId: true,
      };
      expect(estimateSelect.project).toBe(true);
      expect(estimateSelect.projectId).toBe(true);
    });

    it('should have items relation to EstimateItem', () => {
      // REQ-1.1: 見積項目へのリレーション
      const estimateSelect: Prisma.EstimateSelect = {
        items: true,
      };
      expect(estimateSelect.items).toBe(true);
    });
  });

  describe('Estimate filter and sort fields', () => {
    it('should allow filtering by projectId', () => {
      // プロジェクトIDでのフィルタリング
      const where: Prisma.EstimateWhereInput = {
        projectId: 'project-id',
      };
      expect(where.projectId).toBeDefined();
    });

    it('should allow filtering by name', () => {
      // 見積書名でのフィルタリング
      const where: Prisma.EstimateWhereInput = {
        name: { contains: 'テスト' },
      };
      expect(where.name).toBeDefined();
    });

    it('should allow filtering by deletedAt (soft delete)', () => {
      // 論理削除されていないレコードのフィルタリング
      const where: Prisma.EstimateWhereInput = {
        deletedAt: null,
      };
      expect(where.deletedAt).toBeNull();
    });

    it('should allow sorting by createdAt', () => {
      // 作成日時でのソート
      const orderBy: Prisma.EstimateOrderByWithRelationInput = {
        createdAt: 'desc',
      };
      expect(orderBy.createdAt).toBe('desc');
    });

    it('should allow sorting by name', () => {
      // 見積書名でのソート
      const orderBy: Prisma.EstimateOrderByWithRelationInput = {
        name: 'asc',
      };
      expect(orderBy.name).toBe('asc');
    });
  });
});

describe('EstimateItem Model Schema', () => {
  describe('EstimateItem CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // REQ-1.1: 見積項目の必須フィールドの検証
      const validInput: Prisma.EstimateItemCreateInput = {
        displayOrder: 1,
        estimate: { connect: { id: 'estimate-id' } },
      };

      expect(validInput.displayOrder).toBe(1);
    });

    it('should allow optional parent relation for hierarchy', () => {
      // REQ-2.1: 階層構造（親項目との関連付け）
      const input: Prisma.EstimateItemCreateInput = {
        displayOrder: 1,
        estimate: { connect: { id: 'estimate-id' } },
        parent: { connect: { id: 'parent-item-id' } },
      };

      expect(input.parent).toBeDefined();
    });
  });

  describe('EstimateItem fields validation', () => {
    it('should have id field as UUID', () => {
      // 見積項目の一意ID
      const itemSelect: Prisma.EstimateItemSelect = {
        id: true,
      };
      expect(itemSelect.id).toBe(true);
    });

    it('should have estimateId field', () => {
      // 見積書IDフィールド（外部キー）
      const itemSelect: Prisma.EstimateItemSelect = {
        estimateId: true,
      };
      expect(itemSelect.estimateId).toBe(true);
    });

    it('should have parentId field for hierarchy', () => {
      // REQ-2.1: 親項目IDフィールド（自己参照外部キー）
      const itemSelect: Prisma.EstimateItemSelect = {
        parentId: true,
      };
      expect(itemSelect.parentId).toBe(true);
    });

    it('should have displayOrder field', () => {
      // 表示順序フィールド
      const itemSelect: Prisma.EstimateItemSelect = {
        displayOrder: true,
      };
      expect(itemSelect.displayOrder).toBe(true);
    });

    it('should have timestamp fields', () => {
      // タイムスタンプフィールド
      const itemSelect: Prisma.EstimateItemSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(itemSelect.createdAt).toBe(true);
      expect(itemSelect.updatedAt).toBe(true);
    });
  });

  describe('EstimateItem relations', () => {
    it('should have estimate relation', () => {
      // 見積書へのリレーション
      const itemSelect: Prisma.EstimateItemSelect = {
        estimate: true,
        estimateId: true,
      };
      expect(itemSelect.estimate).toBe(true);
      expect(itemSelect.estimateId).toBe(true);
    });

    it('should have parent relation for hierarchy', () => {
      // REQ-2.1: 親項目へのリレーション
      const itemSelect: Prisma.EstimateItemSelect = {
        parent: true,
        parentId: true,
      };
      expect(itemSelect.parent).toBe(true);
      expect(itemSelect.parentId).toBe(true);
    });

    it('should have children relation for hierarchy', () => {
      // REQ-2.4: 子項目へのリレーション
      const itemSelect: Prisma.EstimateItemSelect = {
        children: true,
      };
      expect(itemSelect.children).toBe(true);
    });

    it('should have lines relation to EstimateItemLine', () => {
      // REQ-1.2: 3行1セット（見積金額行・実行金額行・業者金額行）へのリレーション
      const itemSelect: Prisma.EstimateItemSelect = {
        lines: true,
      };
      expect(itemSelect.lines).toBe(true);
    });
  });

  describe('EstimateItem filter and sort fields', () => {
    it('should allow filtering by estimateId', () => {
      // 見積書IDでのフィルタリング
      const where: Prisma.EstimateItemWhereInput = {
        estimateId: 'estimate-id',
      };
      expect(where.estimateId).toBeDefined();
    });

    it('should allow filtering by parentId', () => {
      // REQ-2.2: 親項目IDでのフィルタリング
      const where: Prisma.EstimateItemWhereInput = {
        parentId: 'parent-item-id',
      };
      expect(where.parentId).toBeDefined();
    });

    it('should allow filtering for root items (parentId is null)', () => {
      // ルート項目のフィルタリング（親項目なし）
      const where: Prisma.EstimateItemWhereInput = {
        parentId: null,
      };
      expect(where.parentId).toBeNull();
    });

    it('should allow sorting by displayOrder', () => {
      // 表示順序でのソート
      const orderBy: Prisma.EstimateItemOrderByWithRelationInput = {
        displayOrder: 'asc',
      };
      expect(orderBy.displayOrder).toBe('asc');
    });
  });
});

describe('EstimateItemLine Model Schema', () => {
  describe('EstimateItemLine CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // REQ-1.2: 見積項目行の必須フィールドの検証
      const validInput: Prisma.EstimateItemLineCreateInput = {
        lineType: 'ESTIMATE',
        estimateItem: { connect: { id: 'estimate-item-id' } },
      };

      expect(validInput.lineType).toBe('ESTIMATE');
    });

    it('should allow all optional input fields', () => {
      // REQ-1.6: 名称・規格・単位・数量・単価・備考の入力フィールド
      const input: Prisma.EstimateItemLineCreateInput = {
        lineType: 'ESTIMATE',
        name: 'テスト項目',
        specification: '規格テスト',
        unit: '式',
        quantity: 1.5,
        unitPrice: 10000.0,
        remarks: 'テスト備考',
        estimateItem: { connect: { id: 'estimate-item-id' } },
      };

      expect(input.name).toBe('テスト項目');
      expect(input.specification).toBe('規格テスト');
      expect(input.unit).toBe('式');
      expect(input.quantity).toBe(1.5);
      expect(input.unitPrice).toBe(10000.0);
      expect(input.remarks).toBe('テスト備考');
    });

    it('should allow source quotation reference for VENDOR line', () => {
      // REQ-4.3: 受領見積書からの転記元情報
      const input: Prisma.EstimateItemLineCreateInput = {
        lineType: 'VENDOR',
        name: '業者項目',
        sourceReceivedQuotationLineItemId: 'received-quotation-line-item-id',
        sourceVendorName: 'テスト業者',
        estimateItem: { connect: { id: 'estimate-item-id' } },
      };

      expect(input.sourceReceivedQuotationLineItemId).toBe('received-quotation-line-item-id');
      expect(input.sourceVendorName).toBe('テスト業者');
    });
  });

  describe('EstimateItemLine fields validation', () => {
    it('should have id field as UUID', () => {
      // 見積項目行の一意ID
      const lineSelect: Prisma.EstimateItemLineSelect = {
        id: true,
      };
      expect(lineSelect.id).toBe(true);
    });

    it('should have estimateItemId field', () => {
      // 見積項目IDフィールド（外部キー）
      const lineSelect: Prisma.EstimateItemLineSelect = {
        estimateItemId: true,
      };
      expect(lineSelect.estimateItemId).toBe(true);
    });

    it('should have lineType field with enum values', () => {
      // REQ-1.2: 行タイプフィールド（ESTIMATE/EXECUTION/VENDOR）
      const lineSelect: Prisma.EstimateItemLineSelect = {
        lineType: true,
      };
      expect(lineSelect.lineType).toBe(true);
    });

    it('should have name field', () => {
      // 名称フィールド（最大200文字）
      const lineSelect: Prisma.EstimateItemLineSelect = {
        name: true,
      };
      expect(lineSelect.name).toBe(true);
    });

    it('should have specification field', () => {
      // 規格フィールド（最大500文字）
      const lineSelect: Prisma.EstimateItemLineSelect = {
        specification: true,
      };
      expect(lineSelect.specification).toBe(true);
    });

    it('should have unit field', () => {
      // 単位フィールド（最大50文字）
      const lineSelect: Prisma.EstimateItemLineSelect = {
        unit: true,
      };
      expect(lineSelect.unit).toBe(true);
    });

    it('should have quantity field with high precision decimal', () => {
      // REQ-13.6: 数量フィールド（Decimal(15,4)高精度）
      const lineSelect: Prisma.EstimateItemLineSelect = {
        quantity: true,
      };
      expect(lineSelect.quantity).toBe(true);
    });

    it('should have unitPrice field with decimal precision', () => {
      // 単価フィールド（Decimal(15,2)）
      const lineSelect: Prisma.EstimateItemLineSelect = {
        unitPrice: true,
      };
      expect(lineSelect.unitPrice).toBe(true);
    });

    it('should have amount field with decimal precision (auto-calculated)', () => {
      // REQ-1.3: 金額フィールド（Decimal(15,2)、自動計算）
      const lineSelect: Prisma.EstimateItemLineSelect = {
        amount: true,
      };
      expect(lineSelect.amount).toBe(true);
    });

    it('should have remarks field', () => {
      // 備考フィールド
      const lineSelect: Prisma.EstimateItemLineSelect = {
        remarks: true,
      };
      expect(lineSelect.remarks).toBe(true);
    });

    it('should have source quotation reference fields', () => {
      // REQ-4.3: 転記元の受領見積書明細行ID・業者名
      const lineSelect: Prisma.EstimateItemLineSelect = {
        sourceReceivedQuotationLineItemId: true,
        sourceVendorName: true,
      };
      expect(lineSelect.sourceReceivedQuotationLineItemId).toBe(true);
      expect(lineSelect.sourceVendorName).toBe(true);
    });

    it('should have timestamp fields', () => {
      // タイムスタンプフィールド
      const lineSelect: Prisma.EstimateItemLineSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(lineSelect.createdAt).toBe(true);
      expect(lineSelect.updatedAt).toBe(true);
    });
  });

  describe('EstimateItemLine relations', () => {
    it('should have estimateItem relation', () => {
      // 見積項目へのリレーション
      const lineSelect: Prisma.EstimateItemLineSelect = {
        estimateItem: true,
        estimateItemId: true,
      };
      expect(lineSelect.estimateItem).toBe(true);
      expect(lineSelect.estimateItemId).toBe(true);
    });
  });

  describe('EstimateItemLine filter and sort fields', () => {
    it('should allow filtering by estimateItemId', () => {
      // 見積項目IDでのフィルタリング
      const where: Prisma.EstimateItemLineWhereInput = {
        estimateItemId: 'estimate-item-id',
      };
      expect(where.estimateItemId).toBeDefined();
    });

    it('should allow filtering by lineType', () => {
      // REQ-1.2: 行タイプでのフィルタリング
      const whereEstimate: Prisma.EstimateItemLineWhereInput = {
        lineType: 'ESTIMATE',
      };
      expect(whereEstimate.lineType).toBe('ESTIMATE');

      const whereExecution: Prisma.EstimateItemLineWhereInput = {
        lineType: 'EXECUTION',
      };
      expect(whereExecution.lineType).toBe('EXECUTION');

      const whereVendor: Prisma.EstimateItemLineWhereInput = {
        lineType: 'VENDOR',
      };
      expect(whereVendor.lineType).toBe('VENDOR');
    });

    it('should allow filtering by sourceVendorName', () => {
      // 業者名でのフィルタリング
      const where: Prisma.EstimateItemLineWhereInput = {
        sourceVendorName: { contains: 'テスト業者' },
      };
      expect(where.sourceVendorName).toBeDefined();
    });
  });
});

describe('EstimateItemLineType Enum', () => {
  it('should have ESTIMATE value', () => {
    // REQ-1.2: 見積金額行
    const estimateType: EstimateItemLineType = 'ESTIMATE';
    expect(estimateType).toBe('ESTIMATE');
  });

  it('should have EXECUTION value', () => {
    // REQ-1.2: 実行金額行
    const executionType: EstimateItemLineType = 'EXECUTION';
    expect(executionType).toBe('EXECUTION');
  });

  it('should have VENDOR value', () => {
    // REQ-1.2: 業者金額行
    const vendorType: EstimateItemLineType = 'VENDOR';
    expect(vendorType).toBe('VENDOR');
  });
});
