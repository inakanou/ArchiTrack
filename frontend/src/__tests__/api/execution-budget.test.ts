/**
 * @fileoverview 実行予算APIクライアントのユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 8.1: 実行予算の作成・表示・削除UI実装
 *
 * Requirements:
 * - REQ-1.1-1.7: 実行予算の作成
 * - REQ-2.1-2.3: 実行予算の削除
 * - REQ-3.1-3.10: 実行予算項目の一覧表示
 * - REQ-4.1-4.5: 実行予算項目の編集
 * - REQ-5.1-5.3: 発注一覧表示
 * - REQ-13.1-13.8: 原価管理
 * - REQ-14.1-14.5: 月次締め処理
 * - REQ-15.1-15.8: 契約変更への対応
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getExecutionBudget,
  createExecutionBudget,
  deleteExecutionBudget,
  updateExecutionBudgetItem,
  updateItemCost,
  getOrders,
  executeMonthlyClose,
  getMonthlyCloseHistory,
  getUnreflectedAmendments,
  applyAmendment,
  type ExecutionBudgetWithItems,
  type OrderSummary,
  type MonthlyCloseHistory,
  type UnreflectedAmendment,
} from '../../api/execution-budget';

// モック設定
vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// テストデータ
const projectId = 'project-1';

const mockExecutionBudget: ExecutionBudgetWithItems = {
  id: 'eb-1',
  projectId: 'project-1',
  contractId: 'contract-1',
  version: 1,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  deletedAt: null,
  contract: {
    id: 'contract-1',
    contractDate: '2026-01-15',
    contractAmount: 10000000,
    estimate: { id: 'estimate-1', name: '見積書A' },
  },
  items: [
    {
      id: 'item-1',
      executionBudgetId: 'eb-1',
      estimateItemId: 'ei-1',
      parentId: null,
      displayOrder: 1,
      name: '工事項目A',
      specification: '規格A',
      unit: '式',
      quantity: '1.0000',
      estimateUnitPrice: '1000000.00',
      estimateAmount: '1000000',
      executionUnitPrice: '900000.00',
      executionAmount: '900000',
      amendmentAmount: '0',
      previousMonthExpense: '0',
      currentMonthExpense: '0',
      plannedVendorId: 'vendor-1',
      plannedVendorName: '協力業者A',
      amendmentStatus: null,
      remarks: null,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
      orderStatus: null,
      orderAmount: null,
      progressAmount: null,
      progressRate: null,
    },
  ],
  summary: {
    totalEstimateAmount: '1000000',
    totalExecutionAmount: '900000',
    totalAmendmentAmount: '0',
    totalOrderAmount: '0',
    totalExpense: '0',
    totalRemainingBudget: '900000',
    totalProgressAmount: '0',
    profitForecast: '100000',
    orderProgressRate: '0',
  },
};

const mockOrders: OrderSummary[] = [
  {
    id: 'order-1',
    tradingPartnerName: '協力業者A',
    status: 'ORDERED',
    checkedItemCount: 3,
    totalExecutionAmount: '500000',
    confirmedAmount: '480000',
    createdAt: '2026-03-10T00:00:00Z',
  },
];

const mockMonthlyCloseHistory: MonthlyCloseHistory[] = [
  {
    id: 'mc-1',
    executionBudgetId: 'eb-1',
    targetMonth: '2026-02',
    closedById: 'user-1',
    closedByName: '担当者A',
    closedAt: '2026-03-01T00:00:00Z',
  },
];

const mockUnreflectedAmendments: UnreflectedAmendment[] = [
  {
    id: 'contract-2',
    contractDate: '2026-03-15',
    contractAmount: 12000000,
    estimateName: '見積書B（変更）',
  },
];

describe('execution-budget API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getExecutionBudget - 実行予算取得
  // ==========================================================================
  describe('getExecutionBudget', () => {
    it('実行予算を項目付きで取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockExecutionBudget);

      const result = await getExecutionBudget(projectId);

      expect(apiClient.get).toHaveBeenCalledWith(`/api/projects/${projectId}/execution-budget`);
      expect(result).toEqual(mockExecutionBudget);
    });

    it('実行予算が存在しない場合はnullを返す', async () => {
      const mockError = new ApiError(404, 'Not Found');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      const result = await getExecutionBudget(projectId);

      expect(result).toBeNull();
    });

    it('404以外のAPIエラー時に例外をスローする', async () => {
      const mockError = new ApiError(500, 'Internal Server Error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getExecutionBudget(projectId)).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // createExecutionBudget - 実行予算作成
  // ==========================================================================
  describe('createExecutionBudget', () => {
    it('実行予算を作成する', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockExecutionBudget);

      const result = await createExecutionBudget(projectId, { contractId: 'contract-1' });

      expect(apiClient.post).toHaveBeenCalledWith(`/api/projects/${projectId}/execution-budget`, {
        contractId: 'contract-1',
      });
      expect(result).toEqual(mockExecutionBudget);
    });

    it('既に実行予算が存在する場合に409エラーをスローする', async () => {
      const mockError = new ApiError(409, 'Conflict');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(createExecutionBudget(projectId, { contractId: 'contract-1' })).rejects.toThrow(
        ApiError
      );
    });
  });

  // ==========================================================================
  // deleteExecutionBudget - 実行予算削除
  // ==========================================================================
  describe('deleteExecutionBudget', () => {
    it('実行予算を削除する', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteExecutionBudget(projectId);

      expect(apiClient.delete).toHaveBeenCalledWith(`/api/projects/${projectId}/execution-budget`);
    });

    it('発注済みの発注がある場合に400エラーをスローする', async () => {
      const mockError = new ApiError(400, 'Bad Request');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteExecutionBudget(projectId)).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // updateExecutionBudgetItem - 実行予算項目更新
  // ==========================================================================
  describe('updateExecutionBudgetItem', () => {
    it('実行単価を更新する', async () => {
      const updatedItem = {
        ...mockExecutionBudget.items[0],
        executionUnitPrice: '850000.00',
        executionAmount: '850000',
      };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(updatedItem);

      const result = await updateExecutionBudgetItem(projectId, 'item-1', {
        executionUnitPrice: '850000.00',
        version: 1,
      });

      expect(apiClient.patch).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/items/item-1`,
        { executionUnitPrice: '850000.00', version: 1 }
      );
      expect(result.executionUnitPrice).toBe('850000.00');
    });

    it('楽観的排他制御の競合時に409エラーをスローする', async () => {
      const mockError = new ApiError(409, 'Conflict');
      vi.mocked(apiClient.patch).mockRejectedValueOnce(mockError);

      await expect(
        updateExecutionBudgetItem(projectId, 'item-1', {
          executionUnitPrice: '850000.00',
          version: 1,
        })
      ).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // updateItemCost - 原価入力
  // ==========================================================================
  describe('updateItemCost', () => {
    it('今月の支出を更新する', async () => {
      const updatedItem = {
        ...mockExecutionBudget.items[0],
        currentMonthExpense: '100000',
      };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(updatedItem);

      const result = await updateItemCost(projectId, 'item-1', {
        currentMonthExpense: '100000',
      });

      expect(apiClient.patch).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/items/item-1/cost`,
        { currentMonthExpense: '100000' }
      );
      expect(result.currentMonthExpense).toBe('100000');
    });
  });

  // ==========================================================================
  // getOrders - 発注一覧取得
  // ==========================================================================
  describe('getOrders', () => {
    it('発注一覧を取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockOrders);

      const result = await getOrders(projectId);

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/orders`
      );
      expect(result).toEqual(mockOrders);
    });
  });

  // ==========================================================================
  // executeMonthlyClose - 月次締め実行
  // ==========================================================================
  describe('executeMonthlyClose', () => {
    it('月次締めを実行する', async () => {
      const mockResult: MonthlyCloseHistory = {
        id: 'mc-2',
        executionBudgetId: 'eb-1',
        targetMonth: '2026-03',
        closedById: 'user-1',
        closedByName: '担当者A',
        closedAt: '2026-04-01T00:00:00Z',
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResult);

      const result = await executeMonthlyClose(projectId, { targetMonth: '2026-03' });

      expect(apiClient.post).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/monthly-close`,
        { targetMonth: '2026-03' }
      );
      expect(result).toEqual(mockResult);
    });

    it('重複締め時に409エラーをスローする', async () => {
      const mockError = new ApiError(409, 'Conflict');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(executeMonthlyClose(projectId, { targetMonth: '2026-03' })).rejects.toThrow(
        ApiError
      );
    });
  });

  // ==========================================================================
  // getMonthlyCloseHistory - 月次締め履歴取得
  // ==========================================================================
  describe('getMonthlyCloseHistory', () => {
    it('月次締め履歴を取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockMonthlyCloseHistory);

      const result = await getMonthlyCloseHistory(projectId);

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/monthly-close`
      );
      expect(result).toEqual(mockMonthlyCloseHistory);
    });
  });

  // ==========================================================================
  // getUnreflectedAmendments - 未反映変更契約一覧取得
  // ==========================================================================
  describe('getUnreflectedAmendments', () => {
    it('未反映変更契約一覧を取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockUnreflectedAmendments);

      const result = await getUnreflectedAmendments(projectId);

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/unreflected-amendments`
      );
      expect(result).toEqual(mockUnreflectedAmendments);
    });
  });

  // ==========================================================================
  // applyAmendment - 変更契約反映
  // ==========================================================================
  describe('applyAmendment', () => {
    it('変更契約を反映する', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockExecutionBudget);

      const result = await applyAmendment(projectId, 'contract-2');

      expect(apiClient.post).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/apply-amendment`,
        { contractId: 'contract-2' }
      );
      expect(result).toEqual(mockExecutionBudget);
    });
  });
});
