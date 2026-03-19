/**
 * @fileoverview CostService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 13.1: 各実行予算項目に対して「先月までの支出」「今月の支出」「累計支出」列を表示する
 * - 13.2: 今月の支出を入力→累計支出（先月までの支出 + 今月の支出）を自動計算して更新する
 * - 13.5: 各項目の実行金額と累計支出の差額（残予算）を自動計算して表示する
 * - 13.6: 累計支出が実行金額を超過した場合、警告フラグを設定する
 * - 13.7: 全項目の累計支出合計と残予算合計を合計行に表示する
 * - 13.8: 出来高金額と累計支出の比率（出来高対支出比率）を算出する
 *
 * Task 5.1: 原価管理サービス実装
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CostService, type CostServiceDependencies } from '../../../services/cost.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  ExecutionBudgetNotFoundError,
  ExecutionBudgetConflictError,
} from '../../../errors/executionBudgetError.js';

// ========================================
// モック: Prisma Client
// ========================================

function createMockPrisma() {
  return {
    prisma: {
      executionBudgetItem: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      executionBudget: {
        update: vi.fn(),
      },
      progressRecordItem: {
        findFirst: vi.fn(),
      },
    } as unknown as PrismaClient,
  };
}

// ========================================
// テストデータ
// ========================================

/**
 * 基本的な実行予算項目データ
 */
function createBasicItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    executionBudgetId: 'budget-1',
    executionAmount: { toString: () => '1000000' },
    previousMonthExpense: { toString: () => '300000' },
    currentMonthExpense: { toString: () => '0' },
    quantity: { toString: () => '10' },
    executionBudget: {
      id: 'budget-1',
      version: 0,
      deletedAt: null,
    },
    ...overrides,
  };
}

// ========================================
// テストスイート
// ========================================

describe('CostService', () => {
  let service: CostService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new CostService({
      prisma: mockPrisma.prisma,
    } as CostServiceDependencies);
  });

  // ========================================
  // updateCost: 今月の支出の入力・更新
  // ========================================

  describe('updateCost', () => {
    // Requirement 13.2: 今月の支出を入力→累計支出を自動計算
    it('今月の支出を更新し、累計支出・残予算を正しく計算する', async () => {
      const item = createBasicItem();
      const prisma = mockPrisma.prisma as unknown as {
        executionBudgetItem: {
          findUnique: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
        executionBudget: {
          update: ReturnType<typeof vi.fn>;
        };
        progressRecordItem: {
          findFirst: ReturnType<typeof vi.fn>;
        };
      };

      prisma.executionBudgetItem.findUnique.mockResolvedValue(item);
      prisma.executionBudgetItem.update.mockResolvedValue({
        ...item,
        currentMonthExpense: { toString: () => '200000' },
      });
      prisma.executionBudget.update.mockResolvedValue({
        id: 'budget-1',
        version: 1,
      });
      // 出来高なし
      prisma.progressRecordItem.findFirst.mockResolvedValue(null);

      const result = await service.updateCost('item-1', {
        currentMonthExpense: '200000',
        version: 0,
      });

      // 累計支出 = 先月までの支出(300000) + 今月の支出(200000) = 500000
      expect(result.totalExpense).toBe('500000');
      // 残予算 = 実行金額(1000000) - 累計支出(500000) = 500000
      expect(result.remainingBudget).toBe('500000');
      // 超過していないので警告フラグはfalse
      expect(result.isOverBudget).toBe(false);
      // バージョンがインクリメントされる
      expect(result.version).toBe(1);
    });

    // Requirement 13.6: 累計支出が実行金額を超過した場合の警告フラグ
    it('累計支出が実行金額を超過した場合、警告フラグをtrueに設定する', async () => {
      const item = createBasicItem({
        previousMonthExpense: { toString: () => '800000' },
      });
      const prisma = mockPrisma.prisma as unknown as {
        executionBudgetItem: {
          findUnique: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
        executionBudget: {
          update: ReturnType<typeof vi.fn>;
        };
        progressRecordItem: {
          findFirst: ReturnType<typeof vi.fn>;
        };
      };

      prisma.executionBudgetItem.findUnique.mockResolvedValue(item);
      prisma.executionBudgetItem.update.mockResolvedValue({
        ...item,
        currentMonthExpense: { toString: () => '300000' },
      });
      prisma.executionBudget.update.mockResolvedValue({
        id: 'budget-1',
        version: 1,
      });
      prisma.progressRecordItem.findFirst.mockResolvedValue(null);

      const result = await service.updateCost('item-1', {
        currentMonthExpense: '300000',
        version: 0,
      });

      // 累計支出 = 800000 + 300000 = 1100000 > 実行金額(1000000)
      expect(result.totalExpense).toBe('1100000');
      // 残予算 = 1000000 - 1100000 = -100000（負の値）
      expect(result.remainingBudget).toBe('-100000');
      // 超過フラグがtrue
      expect(result.isOverBudget).toBe(true);
    });

    // Requirement 13.8: 出来高対支出比率の算出
    it('出来高金額と累計支出の比率（出来高対支出比率）を正しく算出する', async () => {
      const item = createBasicItem({
        previousMonthExpense: { toString: () => '200000' },
      });
      const prisma = mockPrisma.prisma as unknown as {
        executionBudgetItem: {
          findUnique: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
        executionBudget: {
          update: ReturnType<typeof vi.fn>;
        };
        progressRecordItem: {
          findFirst: ReturnType<typeof vi.fn>;
        };
      };

      prisma.executionBudgetItem.findUnique.mockResolvedValue(item);
      prisma.executionBudgetItem.update.mockResolvedValue({
        ...item,
        currentMonthExpense: { toString: () => '100000' },
      });
      prisma.executionBudget.update.mockResolvedValue({
        id: 'budget-1',
        version: 1,
      });
      // 出来高金額: 500000
      prisma.progressRecordItem.findFirst.mockResolvedValue({
        amount: { toString: () => '500000' },
      });

      const result = await service.updateCost('item-1', {
        currentMonthExpense: '100000',
        version: 0,
      });

      // 累計支出 = 200000 + 100000 = 300000
      // 出来高対支出比率 = 出来高金額(500000) / 累計支出(300000) * 100 = 166.7
      expect(result.progressToExpenseRatio).toBe('166.7');
    });

    // 出来高がない場合の比率
    it('出来高がない場合、出来高対支出比率をnullとする', async () => {
      const item = createBasicItem();
      const prisma = mockPrisma.prisma as unknown as {
        executionBudgetItem: {
          findUnique: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
        executionBudget: {
          update: ReturnType<typeof vi.fn>;
        };
        progressRecordItem: {
          findFirst: ReturnType<typeof vi.fn>;
        };
      };

      prisma.executionBudgetItem.findUnique.mockResolvedValue(item);
      prisma.executionBudgetItem.update.mockResolvedValue({
        ...item,
        currentMonthExpense: { toString: () => '200000' },
      });
      prisma.executionBudget.update.mockResolvedValue({
        id: 'budget-1',
        version: 1,
      });
      prisma.progressRecordItem.findFirst.mockResolvedValue(null);

      const result = await service.updateCost('item-1', {
        currentMonthExpense: '200000',
        version: 0,
      });

      expect(result.progressToExpenseRatio).toBeNull();
    });

    // 累計支出が0の場合の比率
    it('累計支出が0の場合、出来高対支出比率をnullとする', async () => {
      const item = createBasicItem({
        previousMonthExpense: { toString: () => '0' },
      });
      const prisma = mockPrisma.prisma as unknown as {
        executionBudgetItem: {
          findUnique: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
        executionBudget: {
          update: ReturnType<typeof vi.fn>;
        };
        progressRecordItem: {
          findFirst: ReturnType<typeof vi.fn>;
        };
      };

      prisma.executionBudgetItem.findUnique.mockResolvedValue(item);
      prisma.executionBudgetItem.update.mockResolvedValue({
        ...item,
        currentMonthExpense: { toString: () => '0' },
      });
      prisma.executionBudget.update.mockResolvedValue({
        id: 'budget-1',
        version: 1,
      });
      prisma.progressRecordItem.findFirst.mockResolvedValue({
        amount: { toString: () => '500000' },
      });

      const result = await service.updateCost('item-1', {
        currentMonthExpense: '0',
        version: 0,
      });

      // 累計支出が0なので比率は計算不可
      expect(result.progressToExpenseRatio).toBeNull();
    });

    // 楽観的排他制御: 項目が存在しない場合
    it('実行予算項目が存在しない場合、ExecutionBudgetNotFoundErrorをスローする', async () => {
      const prisma = mockPrisma.prisma as unknown as {
        executionBudgetItem: {
          findUnique: ReturnType<typeof vi.fn>;
        };
      };
      prisma.executionBudgetItem.findUnique.mockResolvedValue(null);

      await expect(
        service.updateCost('non-existent-item', {
          currentMonthExpense: '100000',
          version: 0,
        })
      ).rejects.toThrow(ExecutionBudgetNotFoundError);
    });

    // 楽観的排他制御: 論理削除済みの場合
    it('実行予算が論理削除済みの場合、ExecutionBudgetNotFoundErrorをスローする', async () => {
      const item = createBasicItem({
        executionBudget: {
          id: 'budget-1',
          version: 0,
          deletedAt: new Date(),
        },
      });
      const prisma = mockPrisma.prisma as unknown as {
        executionBudgetItem: {
          findUnique: ReturnType<typeof vi.fn>;
        };
      };
      prisma.executionBudgetItem.findUnique.mockResolvedValue(item);

      await expect(
        service.updateCost('item-1', {
          currentMonthExpense: '100000',
          version: 0,
        })
      ).rejects.toThrow(ExecutionBudgetNotFoundError);
    });

    // 楽観的排他制御: バージョン不一致
    it('バージョンが不一致の場合、ExecutionBudgetConflictErrorをスローする', async () => {
      const item = createBasicItem({
        executionBudget: {
          id: 'budget-1',
          version: 2, // サーバー側はバージョン2
          deletedAt: null,
        },
      });
      const prisma = mockPrisma.prisma as unknown as {
        executionBudgetItem: {
          findUnique: ReturnType<typeof vi.fn>;
        };
      };
      prisma.executionBudgetItem.findUnique.mockResolvedValue(item);

      await expect(
        service.updateCost('item-1', {
          currentMonthExpense: '100000',
          version: 0, // クライアント側はバージョン0
        })
      ).rejects.toThrow(ExecutionBudgetConflictError);
    });

    // 実行金額がnullの場合のハンドリング
    it('実行金額がnullの場合、残予算をnullとし警告フラグをfalseとする', async () => {
      const item = createBasicItem({
        executionAmount: null,
      });
      const prisma = mockPrisma.prisma as unknown as {
        executionBudgetItem: {
          findUnique: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
        executionBudget: {
          update: ReturnType<typeof vi.fn>;
        };
        progressRecordItem: {
          findFirst: ReturnType<typeof vi.fn>;
        };
      };

      prisma.executionBudgetItem.findUnique.mockResolvedValue(item);
      prisma.executionBudgetItem.update.mockResolvedValue({
        ...item,
        currentMonthExpense: { toString: () => '100000' },
      });
      prisma.executionBudget.update.mockResolvedValue({
        id: 'budget-1',
        version: 1,
      });
      prisma.progressRecordItem.findFirst.mockResolvedValue(null);

      const result = await service.updateCost('item-1', {
        currentMonthExpense: '100000',
        version: 0,
      });

      // 累計支出 = 300000 + 100000 = 400000
      expect(result.totalExpense).toBe('400000');
      // 実行金額がnullなので残予算はnull
      expect(result.remainingBudget).toBeNull();
      // 実行金額がnullなので超過判定不可
      expect(result.isOverBudget).toBe(false);
    });

    // Prismaへの正しいupdate呼び出しの検証
    it('currentMonthExpenseを正しくPrismaに渡す', async () => {
      const item = createBasicItem();
      const prisma = mockPrisma.prisma as unknown as {
        executionBudgetItem: {
          findUnique: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
        executionBudget: {
          update: ReturnType<typeof vi.fn>;
        };
        progressRecordItem: {
          findFirst: ReturnType<typeof vi.fn>;
        };
      };

      prisma.executionBudgetItem.findUnique.mockResolvedValue(item);
      prisma.executionBudgetItem.update.mockResolvedValue({
        ...item,
        currentMonthExpense: { toString: () => '150000' },
      });
      prisma.executionBudget.update.mockResolvedValue({
        id: 'budget-1',
        version: 1,
      });
      prisma.progressRecordItem.findFirst.mockResolvedValue(null);

      await service.updateCost('item-1', {
        currentMonthExpense: '150000',
        version: 0,
      });

      // executionBudgetItemのupdateが正しく呼ばれているか
      expect(prisma.executionBudgetItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { currentMonthExpense: '150000' },
      });

      // ExecutionBudgetのバージョンインクリメント
      expect(prisma.executionBudget.update).toHaveBeenCalledWith({
        where: { id: 'budget-1' },
        data: { version: { increment: 1 } },
      });
    });

    // 累計支出が実行金額にぴったり一致する場合
    it('累計支出が実行金額と一致する場合、警告フラグはfalse', async () => {
      const item = createBasicItem({
        previousMonthExpense: { toString: () => '700000' },
      });
      const prisma = mockPrisma.prisma as unknown as {
        executionBudgetItem: {
          findUnique: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
        executionBudget: {
          update: ReturnType<typeof vi.fn>;
        };
        progressRecordItem: {
          findFirst: ReturnType<typeof vi.fn>;
        };
      };

      prisma.executionBudgetItem.findUnique.mockResolvedValue(item);
      prisma.executionBudgetItem.update.mockResolvedValue({
        ...item,
        currentMonthExpense: { toString: () => '300000' },
      });
      prisma.executionBudget.update.mockResolvedValue({
        id: 'budget-1',
        version: 1,
      });
      prisma.progressRecordItem.findFirst.mockResolvedValue(null);

      const result = await service.updateCost('item-1', {
        currentMonthExpense: '300000',
        version: 0,
      });

      // 累計支出 = 700000 + 300000 = 1000000 = 実行金額
      expect(result.totalExpense).toBe('1000000');
      expect(result.remainingBudget).toBe('0');
      // ぴったり一致は超過ではない
      expect(result.isOverBudget).toBe(false);
    });

    // 今月の支出を0に設定する場合
    it('今月の支出を0に更新できる', async () => {
      const item = createBasicItem({
        currentMonthExpense: { toString: () => '200000' },
      });
      const prisma = mockPrisma.prisma as unknown as {
        executionBudgetItem: {
          findUnique: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
        executionBudget: {
          update: ReturnType<typeof vi.fn>;
        };
        progressRecordItem: {
          findFirst: ReturnType<typeof vi.fn>;
        };
      };

      prisma.executionBudgetItem.findUnique.mockResolvedValue(item);
      prisma.executionBudgetItem.update.mockResolvedValue({
        ...item,
        currentMonthExpense: { toString: () => '0' },
      });
      prisma.executionBudget.update.mockResolvedValue({
        id: 'budget-1',
        version: 1,
      });
      prisma.progressRecordItem.findFirst.mockResolvedValue(null);

      const result = await service.updateCost('item-1', {
        currentMonthExpense: '0',
        version: 0,
      });

      // 累計支出 = 300000 + 0 = 300000
      expect(result.totalExpense).toBe('300000');
      expect(result.remainingBudget).toBe('700000');
      expect(result.isOverBudget).toBe(false);
    });
  });
});
