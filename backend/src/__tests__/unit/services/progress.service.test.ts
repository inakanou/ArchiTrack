/**
 * @fileoverview ProgressService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 11.1, 11.2, 11.9, 11.10, 11.11: 出来高入力機能
 * - 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7: 出来高の履歴管理
 *
 * Task 4.1: 出来高入力・履歴管理サービス実装
 * Task 4.2: 月別出来高集計サービス実装
 *
 * - 16.1: 出来高入力データを月別に集計し、月別出来高一覧を提供する
 * - 16.2: 対象月、当月出来高金額、累計出来高金額、累計出来高率を表示する
 * - 16.3: 特定月の項目別出来高明細を表示する
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProgressService } from '../../../services/progress.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  ProgressRecordNotFoundError,
  ExecutionBudgetNotFoundForProgressError,
  ProgressAmountNegativeError,
} from '../../../errors/progressError.js';

// ========================================
// モック: Prisma Client
// ========================================

/**
 * Prismaトランザクション内モックを作成する
 */
function createMockTx() {
  return {
    executionBudget: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    executionBudgetItem: {
      findMany: vi.fn(),
    },
    progressRecord: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    progressRecordItem: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

function createMockPrisma() {
  const mockTx = createMockTx();

  return {
    prisma: {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockTx);
      }),
      progressRecord: {
        findFirst: mockTx.progressRecord.findFirst,
        findUnique: mockTx.progressRecord.findUnique,
        findMany: mockTx.progressRecord.findMany,
        delete: mockTx.progressRecord.delete,
      },
      progressRecordItem: {
        findMany: mockTx.progressRecordItem.findMany,
      },
      executionBudget: {
        findFirst: mockTx.executionBudget.findFirst,
        findUnique: mockTx.executionBudget.findUnique,
      },
      executionBudgetItem: {
        findMany: mockTx.executionBudgetItem.findMany,
      },
      $queryRaw: vi.fn(),
    } as unknown as PrismaClient,
    mockTx,
  };
}

// ========================================
// テストデータ
// ========================================

const BUDGET_ID = '11111111-1111-1111-1111-111111111111';
const PROJECT_ID = '22222222-2222-2222-2222-222222222222';
const ITEM_ID_1 = '33333333-3333-3333-3333-333333333333';
const ITEM_ID_2 = '44444444-4444-4444-4444-444444444444';
const RECORD_ID = '55555555-5555-5555-5555-555555555555';

const mockBudget = {
  id: BUDGET_ID,
  projectId: PROJECT_ID,
  deletedAt: null,
};

const mockBudgetItems = [
  {
    id: ITEM_ID_1,
    executionBudgetId: BUDGET_ID,
    executionAmount: { toString: () => '1000000' },
    parentId: null,
    name: '項目A',
  },
  {
    id: ITEM_ID_2,
    executionBudgetId: BUDGET_ID,
    executionAmount: { toString: () => '500000' },
    parentId: null,
    name: '項目B',
  },
];

// ========================================
// テスト
// ========================================

describe('ProgressService', () => {
  let service: ProgressService;
  let mockPrisma: ReturnType<typeof createMockPrisma>['prisma'];
  let mockTx: ReturnType<typeof createMockTx>;

  beforeEach(() => {
    const mocks = createMockPrisma();
    mockPrisma = mocks.prisma;
    mockTx = mocks.mockTx;
    service = new ProgressService({ prisma: mockPrisma });
  });

  // ========================================
  // save: 出来高保存（Req 11.1, 11.2, 11.9, 11.10, 11.11, 12.1, 12.2）
  // ========================================

  describe('save', () => {
    const saveInput = {
      constructionDate: '2026-03-15',
      items: [
        { itemId: ITEM_ID_1, amount: '600000' },
        { itemId: ITEM_ID_2, amount: '250000' },
      ],
    };

    it('実行予算が存在しない場合、ExecutionBudgetNotFoundForProgressErrorをスローする', async () => {
      mockTx.executionBudget.findFirst.mockResolvedValue(null);

      await expect(service.save(BUDGET_ID, saveInput)).rejects.toThrow(
        ExecutionBudgetNotFoundForProgressError
      );
    });

    it('出来高金額が0円未満の場合、ProgressAmountNegativeErrorをスローする', async () => {
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);

      const invalidInput = {
        constructionDate: '2026-03-15',
        items: [{ itemId: ITEM_ID_1, amount: '-100' }],
      };

      await expect(service.save(BUDGET_ID, invalidInput)).rejects.toThrow(
        ProgressAmountNegativeError
      );
    });

    it('新規施工日の場合、ProgressRecord + ProgressRecordItemsを作成する', async () => {
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.executionBudgetItem.findMany.mockResolvedValue(mockBudgetItems);
      mockTx.progressRecord.findFirst.mockResolvedValue(null); // 既存レコードなし

      const createdRecord = {
        id: RECORD_ID,
        executionBudgetId: BUDGET_ID,
        constructionDate: new Date('2026-03-15'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockTx.progressRecord.create.mockResolvedValue(createdRecord);
      mockTx.progressRecordItem.createMany.mockResolvedValue({ count: 2 });

      // findMany for response building
      mockTx.progressRecordItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          progressRecordId: RECORD_ID,
          executionBudgetItemId: ITEM_ID_1,
          amount: { toString: () => '600000' },
          executionBudgetItem: mockBudgetItems[0],
        },
        {
          id: 'item-2',
          progressRecordId: RECORD_ID,
          executionBudgetItemId: ITEM_ID_2,
          amount: { toString: () => '250000' },
          executionBudgetItem: mockBudgetItems[1],
        },
      ]);

      const result = await service.save(BUDGET_ID, saveInput);

      expect(mockTx.progressRecord.create).toHaveBeenCalled();
      expect(mockTx.progressRecordItem.createMany).toHaveBeenCalled();
      expect(result.id).toBe(RECORD_ID);
      expect(result.items).toHaveLength(2);
    });

    it('同一施工日のレコードが存在する場合、上書き保存（upsert）する', async () => {
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.executionBudgetItem.findMany.mockResolvedValue(mockBudgetItems);

      const existingRecord = {
        id: RECORD_ID,
        executionBudgetId: BUDGET_ID,
        constructionDate: new Date('2026-03-15'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockTx.progressRecord.findFirst.mockResolvedValue(existingRecord);
      mockTx.progressRecordItem.deleteMany.mockResolvedValue({ count: 2 });
      mockTx.progressRecordItem.createMany.mockResolvedValue({ count: 2 });

      mockTx.progressRecordItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          progressRecordId: RECORD_ID,
          executionBudgetItemId: ITEM_ID_1,
          amount: { toString: () => '600000' },
          executionBudgetItem: mockBudgetItems[0],
        },
        {
          id: 'item-2',
          progressRecordId: RECORD_ID,
          executionBudgetItemId: ITEM_ID_2,
          amount: { toString: () => '250000' },
          executionBudgetItem: mockBudgetItems[1],
        },
      ]);

      const result = await service.save(BUDGET_ID, saveInput);

      expect(mockTx.progressRecordItem.deleteMany).toHaveBeenCalledWith({
        where: { progressRecordId: RECORD_ID },
      });
      expect(mockTx.progressRecordItem.createMany).toHaveBeenCalled();
      expect(result.id).toBe(RECORD_ID);
    });

    it('出来高率（出来高金額 / 実行金額 x 100）を自動計算する', async () => {
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.executionBudgetItem.findMany.mockResolvedValue(mockBudgetItems);
      mockTx.progressRecord.findFirst.mockResolvedValue(null);

      const createdRecord = {
        id: RECORD_ID,
        executionBudgetId: BUDGET_ID,
        constructionDate: new Date('2026-03-15'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockTx.progressRecord.create.mockResolvedValue(createdRecord);
      mockTx.progressRecordItem.createMany.mockResolvedValue({ count: 2 });

      mockTx.progressRecordItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          progressRecordId: RECORD_ID,
          executionBudgetItemId: ITEM_ID_1,
          amount: { toString: () => '600000' },
          executionBudgetItem: mockBudgetItems[0],
        },
        {
          id: 'item-2',
          progressRecordId: RECORD_ID,
          executionBudgetItemId: ITEM_ID_2,
          amount: { toString: () => '250000' },
          executionBudgetItem: mockBudgetItems[1],
        },
      ]);

      const result = await service.save(BUDGET_ID, saveInput);

      // 項目A: 600000 / 1000000 * 100 = 60.0%
      const itemA = result.items.find((i) => i.executionBudgetItemId === ITEM_ID_1);
      expect(itemA?.progressRate).toBe('60.0');

      // 項目B: 250000 / 500000 * 100 = 50.0%
      const itemB = result.items.find((i) => i.executionBudgetItemId === ITEM_ID_2);
      expect(itemB?.progressRate).toBe('50.0');
    });

    it('全項目の出来高合計金額と出来高合計率を算出する', async () => {
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.executionBudgetItem.findMany.mockResolvedValue(mockBudgetItems);
      mockTx.progressRecord.findFirst.mockResolvedValue(null);

      const createdRecord = {
        id: RECORD_ID,
        executionBudgetId: BUDGET_ID,
        constructionDate: new Date('2026-03-15'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockTx.progressRecord.create.mockResolvedValue(createdRecord);
      mockTx.progressRecordItem.createMany.mockResolvedValue({ count: 2 });

      mockTx.progressRecordItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          progressRecordId: RECORD_ID,
          executionBudgetItemId: ITEM_ID_1,
          amount: { toString: () => '600000' },
          executionBudgetItem: mockBudgetItems[0],
        },
        {
          id: 'item-2',
          progressRecordId: RECORD_ID,
          executionBudgetItemId: ITEM_ID_2,
          amount: { toString: () => '250000' },
          executionBudgetItem: mockBudgetItems[1],
        },
      ]);

      const result = await service.save(BUDGET_ID, saveInput);

      // 合計金額: 600000 + 250000 = 850000
      expect(result.totalAmount).toBe('850000');

      // 合計率: 850000 / (1000000 + 500000) * 100 = 56.666...% → 56.7%
      expect(result.totalRate).toBe('56.7');
    });

    it('出来高金額が0円の場合、正常に保存できる', async () => {
      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.executionBudgetItem.findMany.mockResolvedValue(mockBudgetItems);
      mockTx.progressRecord.findFirst.mockResolvedValue(null);

      const createdRecord = {
        id: RECORD_ID,
        executionBudgetId: BUDGET_ID,
        constructionDate: new Date('2026-03-15'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockTx.progressRecord.create.mockResolvedValue(createdRecord);
      mockTx.progressRecordItem.createMany.mockResolvedValue({ count: 1 });

      mockTx.progressRecordItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          progressRecordId: RECORD_ID,
          executionBudgetItemId: ITEM_ID_1,
          amount: { toString: () => '0' },
          executionBudgetItem: mockBudgetItems[0],
        },
      ]);

      const zeroInput = {
        constructionDate: '2026-03-15',
        items: [{ itemId: ITEM_ID_1, amount: '0' }],
      };

      const result = await service.save(BUDGET_ID, zeroInput);
      expect(result.items[0]!.amount).toBe('0');
      expect(result.items[0]!.progressRate).toBe('0.0');
    });
  });

  // ========================================
  // findByExecutionBudgetId: 出来高履歴一覧（Req 12.3）
  // ========================================

  describe('findByExecutionBudgetId', () => {
    it('出来高履歴一覧を施工日の降順で取得する', async () => {
      const records = [
        {
          id: 'rec-2',
          executionBudgetId: BUDGET_ID,
          constructionDate: new Date('2026-03-20'),
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { items: 5 },
          items: [],
        },
        {
          id: 'rec-1',
          executionBudgetId: BUDGET_ID,
          constructionDate: new Date('2026-03-15'),
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { items: 5 },
          items: [],
        },
      ];

      mockPrisma.progressRecord.findMany = vi.fn().mockResolvedValue(records);

      const result = await service.findByExecutionBudgetId(BUDGET_ID);

      expect(mockPrisma.progressRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { executionBudgetId: BUDGET_ID },
          orderBy: { constructionDate: 'desc' },
        })
      );
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('rec-2');
    });
  });

  // ========================================
  // getByDate: 施工日指定取得（Req 12.4）
  // ========================================

  describe('getByDate', () => {
    it('指定した施工日の出来高レコードを取得する', async () => {
      const record = {
        id: RECORD_ID,
        executionBudgetId: BUDGET_ID,
        constructionDate: new Date('2026-03-15'),
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 'item-1',
            progressRecordId: RECORD_ID,
            executionBudgetItemId: ITEM_ID_1,
            amount: { toString: () => '600000' },
            executionBudgetItem: {
              ...mockBudgetItems[0],
            },
          },
        ],
      };

      mockPrisma.progressRecord.findFirst = vi.fn().mockResolvedValue(record);
      (mockPrisma.executionBudgetItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudgetItems
      );

      const result = await service.getByDate(BUDGET_ID, new Date('2026-03-15'));

      expect(result).not.toBeNull();
      expect(result!.id).toBe(RECORD_ID);
      expect(result!.items).toHaveLength(1);
    });

    it('指定した施工日のレコードが存在しない場合、ProgressRecordNotFoundErrorをスローする', async () => {
      mockPrisma.progressRecord.findFirst = vi.fn().mockResolvedValue(null);

      await expect(service.getByDate(BUDGET_ID, new Date('2026-03-15'))).rejects.toThrow(
        ProgressRecordNotFoundError
      );
    });
  });

  // ========================================
  // delete: 出来高レコード削除（Req 12.5, 12.6）
  // ========================================

  describe('delete', () => {
    it('出来高レコードを削除する', async () => {
      const record = {
        id: RECORD_ID,
        executionBudgetId: BUDGET_ID,
        constructionDate: new Date('2026-03-15'),
      };

      mockPrisma.progressRecord.findUnique = vi.fn().mockResolvedValue(record);
      mockPrisma.progressRecord.delete = vi.fn().mockResolvedValue(record);

      await service.delete(RECORD_ID);

      expect(mockPrisma.progressRecord.delete).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
      });
    });

    it('存在しないレコードを削除しようとした場合、ProgressRecordNotFoundErrorをスローする', async () => {
      mockPrisma.progressRecord.findUnique = vi.fn().mockResolvedValue(null);

      await expect(service.delete('non-existent-id')).rejects.toThrow(ProgressRecordNotFoundError);
    });
  });

  // ========================================
  // getLatestProgressByBudgetId: 最新出来高取得（Req 12.7）
  // ========================================

  describe('getLatestProgressByBudgetId', () => {
    it('最新施工日における各項目の出来高金額を取得する', async () => {
      const latestRecord = {
        id: RECORD_ID,
        executionBudgetId: BUDGET_ID,
        constructionDate: new Date('2026-03-20'),
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 'item-1',
            progressRecordId: RECORD_ID,
            executionBudgetItemId: ITEM_ID_1,
            amount: { toString: () => '800000' },
          },
          {
            id: 'item-2',
            progressRecordId: RECORD_ID,
            executionBudgetItemId: ITEM_ID_2,
            amount: { toString: () => '400000' },
          },
        ],
      };

      mockPrisma.progressRecord.findFirst = vi.fn().mockResolvedValue(latestRecord);

      const result = await service.getLatestProgressByBudgetId(BUDGET_ID);

      expect(mockPrisma.progressRecord.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { executionBudgetId: BUDGET_ID },
          orderBy: { constructionDate: 'desc' },
        })
      );
      expect(result).not.toBeNull();
      expect(result!.size).toBe(2);
      expect(result!.get(ITEM_ID_1)).toBe('800000');
      expect(result!.get(ITEM_ID_2)).toBe('400000');
    });

    it('出来高レコードが存在しない場合、nullを返す', async () => {
      mockPrisma.progressRecord.findFirst = vi.fn().mockResolvedValue(null);

      const result = await service.getLatestProgressByBudgetId(BUDGET_ID);

      expect(result).toBeNull();
    });
  });

  // ========================================
  // 出来高率計算の境界テスト
  // ========================================

  describe('出来高率計算', () => {
    it('実行金額が0の場合、出来高率を0.0とする', async () => {
      const zeroAmountItems = [
        {
          id: ITEM_ID_1,
          executionBudgetId: BUDGET_ID,
          executionAmount: { toString: () => '0' },
          parentId: null,
          name: '項目A',
        },
      ];

      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.executionBudgetItem.findMany.mockResolvedValue(zeroAmountItems);
      mockTx.progressRecord.findFirst.mockResolvedValue(null);

      const createdRecord = {
        id: RECORD_ID,
        executionBudgetId: BUDGET_ID,
        constructionDate: new Date('2026-03-15'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockTx.progressRecord.create.mockResolvedValue(createdRecord);
      mockTx.progressRecordItem.createMany.mockResolvedValue({ count: 1 });

      mockTx.progressRecordItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          progressRecordId: RECORD_ID,
          executionBudgetItemId: ITEM_ID_1,
          amount: { toString: () => '100' },
          executionBudgetItem: zeroAmountItems[0],
        },
      ]);

      const result = await service.save(BUDGET_ID, {
        constructionDate: '2026-03-15',
        items: [{ itemId: ITEM_ID_1, amount: '100' }],
      });

      // 実行金額が0の場合、出来高率は0.0
      expect(result.items[0]!.progressRate).toBe('0.0');
    });

    it('実行金額がnullの場合、出来高率を0.0とする', async () => {
      const nullAmountItems = [
        {
          id: ITEM_ID_1,
          executionBudgetId: BUDGET_ID,
          executionAmount: null,
          parentId: null,
          name: '項目A',
        },
      ];

      mockTx.executionBudget.findFirst.mockResolvedValue(mockBudget);
      mockTx.executionBudgetItem.findMany.mockResolvedValue(nullAmountItems);
      mockTx.progressRecord.findFirst.mockResolvedValue(null);

      const createdRecord = {
        id: RECORD_ID,
        executionBudgetId: BUDGET_ID,
        constructionDate: new Date('2026-03-15'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockTx.progressRecord.create.mockResolvedValue(createdRecord);
      mockTx.progressRecordItem.createMany.mockResolvedValue({ count: 1 });

      mockTx.progressRecordItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          progressRecordId: RECORD_ID,
          executionBudgetItemId: ITEM_ID_1,
          amount: { toString: () => '100' },
          executionBudgetItem: nullAmountItems[0],
        },
      ]);

      const result = await service.save(BUDGET_ID, {
        constructionDate: '2026-03-15',
        items: [{ itemId: ITEM_ID_1, amount: '100' }],
      });

      expect(result.items[0]!.progressRate).toBe('0.0');
    });
  });

  // ========================================
  // Task 4.2: 月別出来高集計（Req 16.1, 16.2, 16.3）
  // ========================================

  // ========================================
  // getMonthlyAggregation: 月別出来高集計（Req 16.1, 16.2）
  // ========================================

  describe('getMonthlyAggregation', () => {
    it('出来高入力データを月別に集計し、対象月・当月出来高金額・累計出来高金額・累計出来高率を返す', async () => {
      // 実行予算の存在チェック
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudget
      );

      // 実行予算項目（実行金額合計: 1,500,000）
      (mockPrisma.executionBudgetItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudgetItems
      );

      // $queryRawで月別集計結果を返す
      // 2026年1月: 出来高合計 300,000
      // 2026年2月: 出来高合計 500,000
      // 2026年3月: 出来高合計 850,000
      (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
        { year_month: '2026-01', monthly_amount: '300000' },
        { year_month: '2026-02', monthly_amount: '500000' },
        { year_month: '2026-03', monthly_amount: '850000' },
      ]);

      const result = await service.getMonthlyAggregation(BUDGET_ID);

      expect(result).toHaveLength(3);

      // 1月: 当月=300,000, 累計=300,000, 累計率=300000/1500000*100=20.0%
      expect(result[0]!.yearMonth).toBe('2026-01');
      expect(result[0]!.monthlyAmount).toBe('300000');
      expect(result[0]!.cumulativeAmount).toBe('300000');
      expect(result[0]!.cumulativeRate).toBe('20.0');

      // 2月: 当月=500,000, 累計=800,000, 累計率=800000/1500000*100=53.3%
      expect(result[1]!.yearMonth).toBe('2026-02');
      expect(result[1]!.monthlyAmount).toBe('500000');
      expect(result[1]!.cumulativeAmount).toBe('800000');
      expect(result[1]!.cumulativeRate).toBe('53.3');

      // 3月: 当月=850,000, 累計=1,650,000, 累計率=1650000/1500000*100=110.0%
      expect(result[2]!.yearMonth).toBe('2026-03');
      expect(result[2]!.monthlyAmount).toBe('850000');
      expect(result[2]!.cumulativeAmount).toBe('1650000');
      expect(result[2]!.cumulativeRate).toBe('110.0');
    });

    it('出来高レコードが存在しない場合、空配列を返す', async () => {
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudget
      );

      (mockPrisma.executionBudgetItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudgetItems
      );

      (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.getMonthlyAggregation(BUDGET_ID);

      expect(result).toHaveLength(0);
    });

    it('実行金額合計が0の場合、累計出来高率を0.0とする', async () => {
      const zeroAmountItems = [
        {
          id: ITEM_ID_1,
          executionBudgetId: BUDGET_ID,
          executionAmount: null,
          parentId: null,
          name: '項目A',
        },
      ];

      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudget
      );

      (mockPrisma.executionBudgetItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        zeroAmountItems
      );

      (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
        { year_month: '2026-01', monthly_amount: '100000' },
      ]);

      const result = await service.getMonthlyAggregation(BUDGET_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.cumulativeRate).toBe('0.0');
    });

    it('SQLレベルのGROUP BY集計で$queryRawを使用する', async () => {
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudget
      );

      (mockPrisma.executionBudgetItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudgetItems
      );

      (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await service.getMonthlyAggregation(BUDGET_ID);

      // $queryRawが呼ばれていることを確認（SQLレベルの集計）
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('実行予算が存在しない場合、ExecutionBudgetNotFoundForProgressErrorをスローする', async () => {
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.getMonthlyAggregation(BUDGET_ID)).rejects.toThrow(
        ExecutionBudgetNotFoundForProgressError
      );
    });
  });

  // ========================================
  // getMonthlyDetail: 月別明細取得（Req 16.3）
  // ========================================

  describe('getMonthlyDetail', () => {
    it('特定月の項目別出来高明細を取得する', async () => {
      // 実行予算の存在チェック
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudget
      );

      // 実行予算項目
      (mockPrisma.executionBudgetItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudgetItems
      );

      // 2026年3月の出来高レコード（施工日が2026-03-xxのもの）
      const marchRecords = [
        {
          id: 'rec-march-1',
          executionBudgetId: BUDGET_ID,
          constructionDate: new Date('2026-03-10'),
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [
            {
              id: 'pri-1',
              progressRecordId: 'rec-march-1',
              executionBudgetItemId: ITEM_ID_1,
              amount: { toString: () => '400000' },
              executionBudgetItem: mockBudgetItems[0],
            },
            {
              id: 'pri-2',
              progressRecordId: 'rec-march-1',
              executionBudgetItemId: ITEM_ID_2,
              amount: { toString: () => '200000' },
              executionBudgetItem: mockBudgetItems[1],
            },
          ],
        },
        {
          id: 'rec-march-2',
          executionBudgetId: BUDGET_ID,
          constructionDate: new Date('2026-03-20'),
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [
            {
              id: 'pri-3',
              progressRecordId: 'rec-march-2',
              executionBudgetItemId: ITEM_ID_1,
              amount: { toString: () => '600000' },
              executionBudgetItem: mockBudgetItems[0],
            },
            {
              id: 'pri-4',
              progressRecordId: 'rec-march-2',
              executionBudgetItemId: ITEM_ID_2,
              amount: { toString: () => '300000' },
              executionBudgetItem: mockBudgetItems[1],
            },
          ],
        },
      ];

      mockPrisma.progressRecord.findMany = vi.fn().mockResolvedValue(marchRecords);

      const result = await service.getMonthlyDetail(BUDGET_ID, '2026-03');

      // 新仕様（Req-16.3）: 月内の項目別集計を返す（記録別ではない）
      expect(result).toHaveLength(2);

      // 項目A: 月内合計 400000 + 600000 = 1000000、率 = 1000000 / 1000000 = 100.0%
      const itemA = result.find((i) => i.executionBudgetItemId === ITEM_ID_1);
      expect(itemA?.itemName).toBe('項目A');
      expect(itemA?.executionAmount).toBe('1000000');
      expect(itemA?.progressAmount).toBe('1000000');
      expect(itemA?.progressRate).toBe('100.0');

      // 項目B: 月内合計 200000 + 300000 = 500000、率 = 500000 / 500000 = 100.0%
      const itemB = result.find((i) => i.executionBudgetItemId === ITEM_ID_2);
      expect(itemB?.itemName).toBe('項目B');
      expect(itemB?.executionAmount).toBe('500000');
      expect(itemB?.progressAmount).toBe('500000');
      expect(itemB?.progressRate).toBe('100.0');
    });

    it('指定月に出来高レコードが存在しない場合、空配列を返す', async () => {
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudget
      );

      (mockPrisma.executionBudgetItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudgetItems
      );

      mockPrisma.progressRecord.findMany = vi.fn().mockResolvedValue([]);

      const result = await service.getMonthlyDetail(BUDGET_ID, '2026-06');

      expect(result).toHaveLength(0);
    });

    it('施工日の日付範囲フィルタリングでProgressRecordを取得する', async () => {
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudget
      );

      (mockPrisma.executionBudgetItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudgetItems
      );

      const findManyMock = vi.fn().mockResolvedValue([]);
      mockPrisma.progressRecord.findMany = findManyMock;

      await service.getMonthlyDetail(BUDGET_ID, '2026-03');

      // findManyがconstructionDateの範囲フィルタを使用していることを確認
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            executionBudgetId: BUDGET_ID,
            constructionDate: {
              gte: new Date('2026-03-01'),
              lt: new Date('2026-04-01'),
            },
          }),
        })
      );
    });

    it('実行予算が存在しない場合、ExecutionBudgetNotFoundForProgressErrorをスローする', async () => {
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.getMonthlyDetail(BUDGET_ID, '2026-03')).rejects.toThrow(
        ExecutionBudgetNotFoundForProgressError
      );
    });

    it('対象月が12月の場合、翌年1月で日付範囲を構築する', async () => {
      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudget
      );
      (mockPrisma.executionBudgetItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudgetItems
      );
      const findManyMock = vi.fn().mockResolvedValue([]);
      mockPrisma.progressRecord.findMany = findManyMock;

      await service.getMonthlyDetail(BUDGET_ID, '2026-12');

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            constructionDate: {
              gte: new Date('2026-12-01'),
              lt: new Date('2027-01-01'),
            },
          }),
        })
      );
    });

    it('実行予算項目の executionAmount と name が null の場合、率0.0で itemName/executionAmount を null として返す', async () => {
      const itemsWithNulls = [
        {
          id: ITEM_ID_1,
          executionBudgetId: BUDGET_ID,
          executionAmount: null,
          parentId: null,
          name: null,
        },
      ];

      (mockPrisma.executionBudget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockBudget
      );
      (mockPrisma.executionBudgetItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        itemsWithNulls
      );

      const records = [
        {
          id: 'rec-null-1',
          executionBudgetId: BUDGET_ID,
          constructionDate: new Date('2026-03-15'),
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [
            {
              executionBudgetItemId: ITEM_ID_1,
              amount: { toString: () => '100000' },
            },
          ],
        },
      ];
      mockPrisma.progressRecord.findMany = vi.fn().mockResolvedValue(records);

      const result = await service.getMonthlyDetail(BUDGET_ID, '2026-03');

      expect(result).toHaveLength(1);
      expect(result[0]?.itemName).toBeNull();
      expect(result[0]?.executionAmount).toBeNull();
      expect(result[0]?.progressAmount).toBe('100000');
      expect(result[0]?.progressRate).toBe('0.0');
    });
  });
});
