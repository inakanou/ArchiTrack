/**
 * @fileoverview MonthlyCloseService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 13.3: 月次締め操作で今月の支出を先月までの支出に累積する
 * - 13.4: 月次締め完了後、今月の支出をリセットする
 * - 14.1: 月次締めボタンを提供する
 * - 14.2: 締め対象月と処理内容の確認ダイアログを表示する
 * - 14.3: 締め処理を実行し、締め日時と対象月を履歴として記録する
 * - 14.4: 月次締め履歴を一覧表示する
 * - 14.5: 同一月に対して重複締めを阻止する
 *
 * Task 5.2: 月次締めサービス実装
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MonthlyCloseService,
  type MonthlyCloseServiceDependencies,
} from '../../../services/monthly-close.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  ExecutionBudgetNotFoundError,
  MonthlyCloseAlreadyExistsError,
} from '../../../errors/executionBudgetError.js';

// ========================================
// モック: Prisma Client
// ========================================

function createMockPrisma() {
  const txClient = {
    executionBudget: {
      findFirst: vi.fn(),
    },
    monthlyCloseHistory: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    executionBudgetItem: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    prisma: {
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb(txClient);
      }),
      monthlyCloseHistory: {
        findMany: vi.fn(),
      },
      executionBudget: {
        findFirst: vi.fn(),
      },
    } as unknown as PrismaClient,
    txClient,
  };
}

// ========================================
// テストデータ
// ========================================

/**
 * 基本的な実行予算項目データ
 */
function createBudgetItems() {
  return [
    {
      id: 'item-1',
      executionBudgetId: 'budget-1',
      previousMonthExpense: { toString: () => '100000' },
      currentMonthExpense: { toString: () => '50000' },
    },
    {
      id: 'item-2',
      executionBudgetId: 'budget-1',
      previousMonthExpense: { toString: () => '200000' },
      currentMonthExpense: { toString: () => '80000' },
    },
    {
      id: 'item-3',
      executionBudgetId: 'budget-1',
      previousMonthExpense: { toString: () => '0' },
      currentMonthExpense: { toString: () => '30000' },
    },
  ];
}

// ========================================
// テストスイート
// ========================================

describe('MonthlyCloseService', () => {
  let service: MonthlyCloseService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new MonthlyCloseService({
      prisma: mockPrisma.prisma,
    } as MonthlyCloseServiceDependencies);
  });

  // ========================================
  // close: 月次締め処理
  // ========================================

  describe('close', () => {
    // Requirement 13.3, 13.4: 今月の支出を先月までの支出に累積し、今月の支出を0にリセットする
    it('全項目のcurrentMonthExpenseをpreviousMonthExpenseに累積し、currentMonthExpenseを0にリセットする', async () => {
      const items = createBudgetItems();
      const tx = mockPrisma.txClient;

      tx.executionBudget.findFirst.mockResolvedValue({
        id: 'budget-1',
        deletedAt: null,
      });
      tx.monthlyCloseHistory.findFirst.mockResolvedValue(null); // 重複なし
      tx.executionBudgetItem.findMany.mockResolvedValue(items);
      tx.executionBudgetItem.update.mockImplementation(
        async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          return { id: args.where.id, ...args.data };
        }
      );
      tx.monthlyCloseHistory.create.mockResolvedValue({
        id: 'history-1',
        executionBudgetId: 'budget-1',
        targetMonth: '2026-03',
        closedById: 'user-1',
        closedAt: new Date('2026-03-18T00:00:00Z'),
      });

      const result = await service.close('budget-1', '2026-03', 'user-1');

      // 各項目のupdateが呼ばれている
      expect(tx.executionBudgetItem.update).toHaveBeenCalledTimes(3);

      // item-1: previousMonthExpense = 100000 + 50000 = 150000, currentMonthExpense = 0
      expect(tx.executionBudgetItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {
          previousMonthExpense: '150000',
          currentMonthExpense: '0',
        },
      });

      // item-2: previousMonthExpense = 200000 + 80000 = 280000, currentMonthExpense = 0
      expect(tx.executionBudgetItem.update).toHaveBeenCalledWith({
        where: { id: 'item-2' },
        data: {
          previousMonthExpense: '280000',
          currentMonthExpense: '0',
        },
      });

      // item-3: previousMonthExpense = 0 + 30000 = 30000, currentMonthExpense = 0
      expect(tx.executionBudgetItem.update).toHaveBeenCalledWith({
        where: { id: 'item-3' },
        data: {
          previousMonthExpense: '30000',
          currentMonthExpense: '0',
        },
      });

      // 月次締め履歴の作成結果を返却
      expect(result.id).toBe('history-1');
      expect(result.targetMonth).toBe('2026-03');
    });

    // Requirement 14.3: 締め処理を実行し、締め日時と対象月を履歴として記録する
    it('MonthlyCloseHistoryを正しく作成する', async () => {
      const items = createBudgetItems();
      const tx = mockPrisma.txClient;

      tx.executionBudget.findFirst.mockResolvedValue({
        id: 'budget-1',
        deletedAt: null,
      });
      tx.monthlyCloseHistory.findFirst.mockResolvedValue(null);
      tx.executionBudgetItem.findMany.mockResolvedValue(items);
      tx.executionBudgetItem.update.mockResolvedValue({});
      tx.monthlyCloseHistory.create.mockResolvedValue({
        id: 'history-1',
        executionBudgetId: 'budget-1',
        targetMonth: '2026-03',
        closedById: 'user-1',
        closedAt: new Date('2026-03-18T00:00:00Z'),
      });

      await service.close('budget-1', '2026-03', 'user-1');

      expect(tx.monthlyCloseHistory.create).toHaveBeenCalledWith({
        data: {
          executionBudgetId: 'budget-1',
          targetMonth: '2026-03',
          closedById: 'user-1',
        },
      });
    });

    // Requirement 14.5: 同一月に対して重複締めを阻止する
    it('同一月に対して既に月次締めが実行済みの場合、MonthlyCloseAlreadyExistsErrorをスローする', async () => {
      const tx = mockPrisma.txClient;

      tx.executionBudget.findFirst.mockResolvedValue({
        id: 'budget-1',
        deletedAt: null,
      });
      // 既に同月の締め履歴が存在する
      tx.monthlyCloseHistory.findFirst.mockResolvedValue({
        id: 'existing-history',
        executionBudgetId: 'budget-1',
        targetMonth: '2026-03',
        closedById: 'user-1',
        closedAt: new Date('2026-03-15T00:00:00Z'),
      });

      await expect(service.close('budget-1', '2026-03', 'user-1')).rejects.toThrow(
        MonthlyCloseAlreadyExistsError
      );
    });

    // 実行予算が存在しない場合
    it('実行予算が存在しない場合、ExecutionBudgetNotFoundErrorをスローする', async () => {
      const tx = mockPrisma.txClient;
      tx.executionBudget.findFirst.mockResolvedValue(null);

      await expect(service.close('non-existent', '2026-03', 'user-1')).rejects.toThrow(
        ExecutionBudgetNotFoundError
      );
    });

    // 実行予算が論理削除済みの場合
    it('実行予算が論理削除済みの場合、ExecutionBudgetNotFoundErrorをスローする', async () => {
      const tx = mockPrisma.txClient;
      tx.executionBudget.findFirst.mockResolvedValue({
        id: 'budget-1',
        deletedAt: new Date(),
      });

      await expect(service.close('budget-1', '2026-03', 'user-1')).rejects.toThrow(
        ExecutionBudgetNotFoundError
      );
    });

    // トランザクション内で実行されること
    it('トランザクション内で一括更新とMonthlyCloseHistory作成を行う', async () => {
      const items = createBudgetItems();
      const tx = mockPrisma.txClient;

      tx.executionBudget.findFirst.mockResolvedValue({
        id: 'budget-1',
        deletedAt: null,
      });
      tx.monthlyCloseHistory.findFirst.mockResolvedValue(null);
      tx.executionBudgetItem.findMany.mockResolvedValue(items);
      tx.executionBudgetItem.update.mockResolvedValue({});
      tx.monthlyCloseHistory.create.mockResolvedValue({
        id: 'history-1',
        executionBudgetId: 'budget-1',
        targetMonth: '2026-03',
        closedById: 'user-1',
        closedAt: new Date(),
      });

      await service.close('budget-1', '2026-03', 'user-1');

      // $transactionが呼ばれている
      expect(mockPrisma.prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    // 項目が0件の場合でも正常に処理する
    it('実行予算に項目がない場合でも、MonthlyCloseHistoryを作成して正常終了する', async () => {
      const tx = mockPrisma.txClient;

      tx.executionBudget.findFirst.mockResolvedValue({
        id: 'budget-1',
        deletedAt: null,
      });
      tx.monthlyCloseHistory.findFirst.mockResolvedValue(null);
      tx.executionBudgetItem.findMany.mockResolvedValue([]);
      tx.monthlyCloseHistory.create.mockResolvedValue({
        id: 'history-1',
        executionBudgetId: 'budget-1',
        targetMonth: '2026-03',
        closedById: 'user-1',
        closedAt: new Date(),
      });

      const result = await service.close('budget-1', '2026-03', 'user-1');

      expect(tx.executionBudgetItem.update).not.toHaveBeenCalled();
      expect(result.id).toBe('history-1');
    });

    // currentMonthExpenseが0の項目はpreviousMonthExpenseが変わらないこと
    it('currentMonthExpenseが0の項目はpreviousMonthExpenseに0を加算し、currentMonthExpenseを0にリセットする', async () => {
      const items = [
        {
          id: 'item-zero',
          executionBudgetId: 'budget-1',
          previousMonthExpense: { toString: () => '500000' },
          currentMonthExpense: { toString: () => '0' },
        },
      ];
      const tx = mockPrisma.txClient;

      tx.executionBudget.findFirst.mockResolvedValue({
        id: 'budget-1',
        deletedAt: null,
      });
      tx.monthlyCloseHistory.findFirst.mockResolvedValue(null);
      tx.executionBudgetItem.findMany.mockResolvedValue(items);
      tx.executionBudgetItem.update.mockResolvedValue({});
      tx.monthlyCloseHistory.create.mockResolvedValue({
        id: 'history-1',
        executionBudgetId: 'budget-1',
        targetMonth: '2026-03',
        closedById: 'user-1',
        closedAt: new Date(),
      });

      await service.close('budget-1', '2026-03', 'user-1');

      expect(tx.executionBudgetItem.update).toHaveBeenCalledWith({
        where: { id: 'item-zero' },
        data: {
          previousMonthExpense: '500000',
          currentMonthExpense: '0',
        },
      });
    });
  });

  // ========================================
  // getHistory: 月次締め履歴の一覧取得
  // ========================================

  describe('getHistory', () => {
    // Requirement 14.4: 月次締め履歴を一覧表示する
    it('月次締め履歴を締め日時の降順で取得する', async () => {
      const histories = [
        {
          id: 'history-2',
          executionBudgetId: 'budget-1',
          targetMonth: '2026-03',
          closedById: 'user-1',
          closedAt: new Date('2026-03-31T00:00:00Z'),
          closedBy: { id: 'user-1', displayName: 'テストユーザー' },
        },
        {
          id: 'history-1',
          executionBudgetId: 'budget-1',
          targetMonth: '2026-02',
          closedById: 'user-1',
          closedAt: new Date('2026-02-28T00:00:00Z'),
          closedBy: { id: 'user-1', displayName: 'テストユーザー' },
        },
      ];

      const prisma = mockPrisma.prisma as unknown as {
        executionBudget: {
          findFirst: ReturnType<typeof vi.fn>;
        };
        monthlyCloseHistory: {
          findMany: ReturnType<typeof vi.fn>;
        };
      };

      prisma.executionBudget.findFirst.mockResolvedValue({
        id: 'budget-1',
        deletedAt: null,
      });
      prisma.monthlyCloseHistory.findMany.mockResolvedValue(histories);

      const result = await service.getHistory('budget-1');

      expect(result).toHaveLength(2);
      expect(result[0]!.targetMonth).toBe('2026-03');
      expect(result[1]!.targetMonth).toBe('2026-02');

      expect(prisma.monthlyCloseHistory.findMany).toHaveBeenCalledWith({
        where: { executionBudgetId: 'budget-1' },
        orderBy: { closedAt: 'desc' },
        include: {
          closedBy: {
            select: { id: true, displayName: true },
          },
        },
      });
    });

    // 履歴がない場合
    it('月次締め履歴がない場合、空配列を返却する', async () => {
      const prisma = mockPrisma.prisma as unknown as {
        executionBudget: {
          findFirst: ReturnType<typeof vi.fn>;
        };
        monthlyCloseHistory: {
          findMany: ReturnType<typeof vi.fn>;
        };
      };

      prisma.executionBudget.findFirst.mockResolvedValue({
        id: 'budget-1',
        deletedAt: null,
      });
      prisma.monthlyCloseHistory.findMany.mockResolvedValue([]);

      const result = await service.getHistory('budget-1');

      expect(result).toHaveLength(0);
    });

    // 実行予算が存在しない場合
    it('実行予算が存在しない場合、ExecutionBudgetNotFoundErrorをスローする', async () => {
      const prisma = mockPrisma.prisma as unknown as {
        executionBudget: {
          findFirst: ReturnType<typeof vi.fn>;
        };
      };

      prisma.executionBudget.findFirst.mockResolvedValue(null);

      await expect(service.getHistory('non-existent')).rejects.toThrow(
        ExecutionBudgetNotFoundError
      );
    });
  });
});
