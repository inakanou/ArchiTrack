/**
 * @fileoverview 内訳書機能 型定義のユニットテスト
 *
 * Task 4.2: 型定義とバリデーションの実装
 *
 * Requirements:
 * - 1.3: 内訳書作成
 * - 3.4: 内訳書一覧表示
 * - 4.1: 内訳書詳細取得
 * - 7.3: 内訳書削除
 * - 10.4: 楽観的排他制御エラー
 */

import { describe, it, expect } from 'vitest';
import {
  ITEMIZED_STATEMENT_SORTABLE_FIELDS,
  isItemizedStatementSortableField,
  isItemizedStatementNotFoundErrorResponse,
  isItemizedStatementConflictErrorResponse,
  isDuplicateItemizedStatementNameErrorResponse,
  isEmptyQuantityItemsErrorResponse,
  isQuantityOverflowErrorResponse,
  type ItemizedStatementInfo,
  type ItemizedStatementDetail,
  type ItemizedStatementItemInfo,
  type ProjectItemizedStatementSummary,
  type PaginatedItemizedStatements,
  type ItemizedStatementPaginationInfo,
  type ItemizedStatementFilter,
  type ItemizedStatementSortableField,
  type ItemizedStatementSortOrder,
  type CreateItemizedStatementInput,
  type ItemizedStatementNotFoundErrorResponse,
  type ItemizedStatementConflictErrorResponse,
  type DuplicateItemizedStatementNameErrorResponse,
  type EmptyQuantityItemsErrorResponse,
  type QuantityOverflowErrorResponse,
} from '../../types/itemized-statement.types';

describe('Itemized Statement Types', () => {
  // ==========================================================================
  // ITEMIZED_STATEMENT_SORTABLE_FIELDS
  // ==========================================================================
  describe('ITEMIZED_STATEMENT_SORTABLE_FIELDS', () => {
    it('ソート可能フィールドとしてcreatedAtとnameが定義されていること', () => {
      expect(ITEMIZED_STATEMENT_SORTABLE_FIELDS).toContain('createdAt');
      expect(ITEMIZED_STATEMENT_SORTABLE_FIELDS).toContain('name');
    });

    it('ソート可能フィールドが2種類であること', () => {
      expect(ITEMIZED_STATEMENT_SORTABLE_FIELDS).toHaveLength(2);
    });
  });

  // ==========================================================================
  // isItemizedStatementSortableField
  // ==========================================================================
  describe('isItemizedStatementSortableField', () => {
    it('有効なソートフィールドに対してtrueを返すこと', () => {
      expect(isItemizedStatementSortableField('createdAt')).toBe(true);
      expect(isItemizedStatementSortableField('name')).toBe(true);
    });

    it('無効な値に対してfalseを返すこと', () => {
      expect(isItemizedStatementSortableField('INVALID')).toBe(false);
      expect(isItemizedStatementSortableField('')).toBe(false);
      expect(isItemizedStatementSortableField(null)).toBe(false);
      expect(isItemizedStatementSortableField(undefined)).toBe(false);
      expect(isItemizedStatementSortableField(123)).toBe(false);
      expect(isItemizedStatementSortableField({})).toBe(false);
    });

    it('類似する不正な文字列に対してfalseを返すこと', () => {
      expect(isItemizedStatementSortableField('CreatedAt')).toBe(false); // 大文字
      expect(isItemizedStatementSortableField('created_at')).toBe(false); // スネークケース
      expect(isItemizedStatementSortableField('updatedAt')).toBe(false); // 数量表にはあるが内訳書には不要
    });
  });

  // ==========================================================================
  // ItemizedStatementInfo（一覧表示用）
  // ==========================================================================
  describe('ItemizedStatementInfo', () => {
    it('正しい構造を持っていること', () => {
      const info: ItemizedStatementInfo = {
        id: 'is-123',
        projectId: 'project-1',
        name: '第1回内訳書',
        sourceQuantityTableId: 'qt-1',
        sourceQuantityTableName: '数量表1',
        itemCount: 15,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      };
      expect(info.id).toBe('is-123');
      expect(info.projectId).toBe('project-1');
      expect(info.name).toBe('第1回内訳書');
      expect(info.sourceQuantityTableId).toBe('qt-1');
      expect(info.sourceQuantityTableName).toBe('数量表1');
      expect(info.itemCount).toBe(15);
      expect(info.createdAt).toBe('2025-01-01T00:00:00.000Z');
      expect(info.updatedAt).toBe('2025-01-02T00:00:00.000Z');
    });
  });

  // ==========================================================================
  // ItemizedStatementItemInfo（項目情報）
  // ==========================================================================
  describe('ItemizedStatementItemInfo', () => {
    it('正しい構造を持っていること', () => {
      const item: ItemizedStatementItemInfo = {
        id: 'item-1',
        customCategory: '土工',
        workType: '掘削',
        name: '掘削工',
        specification: '標準',
        unit: 'm3',
        quantity: 100.5,
      };
      expect(item.id).toBe('item-1');
      expect(item.customCategory).toBe('土工');
      expect(item.workType).toBe('掘削');
      expect(item.name).toBe('掘削工');
      expect(item.specification).toBe('標準');
      expect(item.unit).toBe('m3');
      expect(item.quantity).toBe(100.5);
    });

    it('optionalフィールドがnullを許容すること', () => {
      const item: ItemizedStatementItemInfo = {
        id: 'item-2',
        customCategory: null,
        workType: null,
        name: null,
        specification: null,
        unit: null,
        quantity: 0,
      };
      expect(item.customCategory).toBeNull();
      expect(item.workType).toBeNull();
      expect(item.name).toBeNull();
      expect(item.specification).toBeNull();
      expect(item.unit).toBeNull();
    });
  });

  // ==========================================================================
  // ItemizedStatementDetail（詳細）
  // ==========================================================================
  describe('ItemizedStatementDetail', () => {
    it('正しい構造を持っていること', () => {
      const detail: ItemizedStatementDetail = {
        id: 'is-1',
        projectId: 'project-1',
        project: { id: 'project-1', name: 'テストプロジェクト' },
        name: '第1回内訳書',
        sourceQuantityTableId: 'qt-1',
        sourceQuantityTableName: '数量表1',
        itemCount: 2,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
        items: [
          {
            id: 'item-1',
            customCategory: '土工',
            workType: '掘削',
            name: '掘削工',
            specification: null,
            unit: 'm3',
            quantity: 100,
          },
          {
            id: 'item-2',
            customCategory: '土工',
            workType: '盛土',
            name: '盛土工',
            specification: '良質土',
            unit: 'm3',
            quantity: 50,
          },
        ],
      };
      expect(detail.id).toBe('is-1');
      expect(detail.project.name).toBe('テストプロジェクト');
      expect(detail.items).toHaveLength(2);
      expect(detail.items[0]?.name).toBe('掘削工');
    });
  });

  // ==========================================================================
  // ProjectItemizedStatementSummary（プロジェクトサマリー）
  // ==========================================================================
  describe('ProjectItemizedStatementSummary', () => {
    it('正しい構造を持っていること', () => {
      const summary: ProjectItemizedStatementSummary = {
        totalCount: 5,
        latestStatements: [
          {
            id: 'is-1',
            projectId: 'project-1',
            name: '内訳書1',
            sourceQuantityTableId: 'qt-1',
            sourceQuantityTableName: '数量表1',
            itemCount: 10,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      };
      expect(summary.totalCount).toBe(5);
      expect(summary.latestStatements).toHaveLength(1);
    });

    it('空の内訳書リストを持てること', () => {
      const summary: ProjectItemizedStatementSummary = {
        totalCount: 0,
        latestStatements: [],
      };
      expect(summary.totalCount).toBe(0);
      expect(summary.latestStatements).toHaveLength(0);
    });
  });

  // ==========================================================================
  // PaginatedItemizedStatements（ページネーション）
  // ==========================================================================
  describe('PaginatedItemizedStatements', () => {
    it('正しい構造を持っていること', () => {
      const paginated: PaginatedItemizedStatements = {
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 100,
          totalPages: 5,
        },
      };
      expect(paginated.data).toEqual([]);
      expect(paginated.pagination.page).toBe(1);
      expect(paginated.pagination.limit).toBe(20);
      expect(paginated.pagination.total).toBe(100);
      expect(paginated.pagination.totalPages).toBe(5);
    });
  });

  // ==========================================================================
  // ItemizedStatementPaginationInfo
  // ==========================================================================
  describe('ItemizedStatementPaginationInfo', () => {
    it('正しい構造を持っていること', () => {
      const pagination: ItemizedStatementPaginationInfo = {
        page: 2,
        limit: 10,
        total: 50,
        totalPages: 5,
      };
      expect(pagination.page).toBe(2);
      expect(pagination.limit).toBe(10);
      expect(pagination.total).toBe(50);
      expect(pagination.totalPages).toBe(5);
    });
  });

  // ==========================================================================
  // ItemizedStatementFilter
  // ==========================================================================
  describe('ItemizedStatementFilter', () => {
    it('空のフィルタを許容すること', () => {
      const filter: ItemizedStatementFilter = {};
      expect(Object.keys(filter)).toHaveLength(0);
    });

    it('検索キーワードを持てること', () => {
      const filter: ItemizedStatementFilter = {
        search: '内訳',
      };
      expect(filter.search).toBe('内訳');
    });
  });

  // ==========================================================================
  // CreateItemizedStatementInput
  // ==========================================================================
  describe('CreateItemizedStatementInput', () => {
    it('正しい構造を持っていること', () => {
      const input: CreateItemizedStatementInput = {
        name: '新規内訳書',
        quantityTableId: 'qt-1',
      };
      expect(input.name).toBe('新規内訳書');
      expect(input.quantityTableId).toBe('qt-1');
    });
  });

  // ==========================================================================
  // エラーレスポンス型のタイプガード
  // ==========================================================================
  describe('isItemizedStatementNotFoundErrorResponse', () => {
    it('正しいエラーレスポンスに対してtrueを返すこと', () => {
      const error: ItemizedStatementNotFoundErrorResponse = {
        type: 'https://architrack.example.com/problems/itemized-statement-not-found',
        title: 'Itemized Statement Not Found',
        status: 404,
        detail: '内訳書が見つかりません',
        code: 'ITEMIZED_STATEMENT_NOT_FOUND',
      };
      expect(isItemizedStatementNotFoundErrorResponse(error)).toBe(true);
    });

    it('無効な値に対してfalseを返すこと', () => {
      expect(isItemizedStatementNotFoundErrorResponse(null)).toBe(false);
      expect(isItemizedStatementNotFoundErrorResponse(undefined)).toBe(false);
      expect(isItemizedStatementNotFoundErrorResponse({})).toBe(false);
      expect(isItemizedStatementNotFoundErrorResponse({ status: 404 })).toBe(false);
    });

    it('コードが異なる場合falseを返すこと', () => {
      const error = {
        type: 'https://architrack.example.com/problems/itemized-statement-not-found',
        title: 'Not Found',
        status: 404,
        detail: 'エラー',
        code: 'WRONG_CODE',
      };
      expect(isItemizedStatementNotFoundErrorResponse(error)).toBe(false);
    });
  });

  describe('isItemizedStatementConflictErrorResponse', () => {
    it('正しいエラーレスポンスに対してtrueを返すこと', () => {
      const error: ItemizedStatementConflictErrorResponse = {
        type: 'https://architrack.example.com/problems/itemized-statement-conflict',
        title: 'Conflict',
        status: 409,
        detail: '他のユーザーにより更新されました',
        code: 'ITEMIZED_STATEMENT_CONFLICT',
      };
      expect(isItemizedStatementConflictErrorResponse(error)).toBe(true);
    });

    it('無効な値に対してfalseを返すこと', () => {
      expect(isItemizedStatementConflictErrorResponse(null)).toBe(false);
      expect(isItemizedStatementConflictErrorResponse(undefined)).toBe(false);
      expect(isItemizedStatementConflictErrorResponse({})).toBe(false);
    });

    it('ステータスが異なる場合falseを返すこと', () => {
      const error = {
        type: 'https://architrack.example.com/problems/itemized-statement-conflict',
        title: 'Conflict',
        status: 400, // 間違ったステータス
        detail: 'エラー',
        code: 'ITEMIZED_STATEMENT_CONFLICT',
      };
      expect(isItemizedStatementConflictErrorResponse(error)).toBe(false);
    });
  });

  describe('isDuplicateItemizedStatementNameErrorResponse', () => {
    it('正しいエラーレスポンスに対してtrueを返すこと', () => {
      const error: DuplicateItemizedStatementNameErrorResponse = {
        type: 'https://architrack.example.com/problems/duplicate-itemized-statement-name',
        title: 'Duplicate Name',
        status: 409,
        detail: '同名の内訳書が既に存在します',
        code: 'DUPLICATE_ITEMIZED_STATEMENT_NAME',
        name: '重複内訳書',
        projectId: 'project-1',
      };
      expect(isDuplicateItemizedStatementNameErrorResponse(error)).toBe(true);
    });

    it('無効な値に対してfalseを返すこと', () => {
      expect(isDuplicateItemizedStatementNameErrorResponse(null)).toBe(false);
      expect(isDuplicateItemizedStatementNameErrorResponse({})).toBe(false);
    });

    it('必須フィールドが欠けている場合falseを返すこと', () => {
      const error = {
        type: 'https://architrack.example.com/problems/duplicate-itemized-statement-name',
        title: 'Duplicate Name',
        status: 409,
        detail: 'エラー',
        code: 'DUPLICATE_ITEMIZED_STATEMENT_NAME',
        // name と projectId がない
      };
      expect(isDuplicateItemizedStatementNameErrorResponse(error)).toBe(false);
    });
  });

  describe('isEmptyQuantityItemsErrorResponse', () => {
    it('正しいエラーレスポンスに対してtrueを返すこと', () => {
      const error: EmptyQuantityItemsErrorResponse = {
        type: 'https://architrack.example.com/problems/empty-quantity-items',
        title: 'Empty Quantity Items',
        status: 400,
        detail: '数量表に項目がありません',
        code: 'EMPTY_QUANTITY_ITEMS',
        quantityTableId: 'qt-1',
      };
      expect(isEmptyQuantityItemsErrorResponse(error)).toBe(true);
    });

    it('無効な値に対してfalseを返すこと', () => {
      expect(isEmptyQuantityItemsErrorResponse(null)).toBe(false);
      expect(isEmptyQuantityItemsErrorResponse({})).toBe(false);
    });
  });

  describe('isQuantityOverflowErrorResponse', () => {
    it('正しいエラーレスポンスに対してtrueを返すこと', () => {
      const error: QuantityOverflowErrorResponse = {
        type: 'https://architrack.example.com/problems/quantity-overflow',
        title: 'Quantity Overflow',
        status: 422,
        detail: '数量の合計が許容範囲を超えています',
        code: 'QUANTITY_OVERFLOW',
      };
      expect(isQuantityOverflowErrorResponse(error)).toBe(true);
    });

    it('無効な値に対してfalseを返すこと', () => {
      expect(isQuantityOverflowErrorResponse(null)).toBe(false);
      expect(isQuantityOverflowErrorResponse({})).toBe(false);
    });

    it('ステータスが異なる場合falseを返すこと', () => {
      const error = {
        type: 'https://architrack.example.com/problems/quantity-overflow',
        title: 'Quantity Overflow',
        status: 400, // 間違ったステータス
        detail: 'エラー',
        code: 'QUANTITY_OVERFLOW',
      };
      expect(isQuantityOverflowErrorResponse(error)).toBe(false);
    });
  });

  // ==========================================================================
  // ソート順序型
  // ==========================================================================
  describe('ItemizedStatementSortOrder', () => {
    it('asc と desc のみを許容すること', () => {
      const ascOrder: ItemizedStatementSortOrder = 'asc';
      const descOrder: ItemizedStatementSortOrder = 'desc';
      expect(ascOrder).toBe('asc');
      expect(descOrder).toBe('desc');
    });
  });

  // ==========================================================================
  // ソートフィールド型
  // ==========================================================================
  describe('ItemizedStatementSortableField', () => {
    it('createdAt と name のみを許容すること', () => {
      const createdAtField: ItemizedStatementSortableField = 'createdAt';
      const nameField: ItemizedStatementSortableField = 'name';
      expect(createdAtField).toBe('createdAt');
      expect(nameField).toBe('name');
    });
  });
});
