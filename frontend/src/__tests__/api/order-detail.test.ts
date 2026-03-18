/**
 * @fileoverview 発注詳細APIクライアントのユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 9.1: 発注の作成・編集・削除UI実装
 * Task 9.2: 発注エクスポートUI実装
 *
 * Requirements:
 * - REQ-6.1-6.8: 発注の作成と取引先指定
 * - REQ-7.1-7.5: 発注の編集と削除
 * - REQ-8.1-8.9: 発注金額の確定と案分
 * - REQ-10.1-10.4: 発注一覧のエクスポート
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getOrderDetail,
  createOrder,
  updateOrder,
  updateOrderItems,
  updateOrderStatus,
  deleteOrder,
  exportOrder,
  type OrderWithItems,
  type OrderItem,
} from '../../api/order-detail';

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
const orderId = 'order-1';

const mockOrderItem: OrderItem = {
  id: 'oi-1',
  orderId: 'order-1',
  executionBudgetItemId: 'ebi-1',
  checked: true,
  orderAmount: null,
  executionBudgetItem: {
    id: 'ebi-1',
    name: '工事項目A',
    specification: '規格A',
    unit: '式',
    quantity: '1.0000',
    executionUnitPrice: '900000.00',
    executionAmount: '900000',
    plannedVendorId: 'vendor-1',
    plannedVendorName: '協力業者A',
  },
};

const mockOrderWithItems: OrderWithItems = {
  id: 'order-1',
  executionBudgetId: 'eb-1',
  tradingPartnerId: 'vendor-1',
  tradingPartnerName: '協力業者A',
  status: 'BEFORE_ORDER',
  confirmedAmount: null,
  version: 0,
  createdAt: '2026-03-10T00:00:00Z',
  updatedAt: '2026-03-10T00:00:00Z',
  deletedAt: null,
  items: [mockOrderItem],
  totalExecutionAmount: '900000',
  checkedItemCount: 1,
};

describe('order-detail API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getOrderDetail - 発注詳細取得
  // ==========================================================================
  describe('getOrderDetail', () => {
    it('発注詳細を項目付きで取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockOrderWithItems);

      const result = await getOrderDetail(projectId, orderId);

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/orders/${orderId}`
      );
      expect(result).toEqual(mockOrderWithItems);
    });

    it('発注が存在しない場合に404エラーをスローする', async () => {
      const mockError = new ApiError(404, 'Not Found');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getOrderDetail(projectId, orderId)).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // createOrder - 発注作成
  // ==========================================================================
  describe('createOrder', () => {
    it('取引先を指定して発注を作成する', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockOrderWithItems);

      const result = await createOrder(projectId, { tradingPartnerId: 'vendor-1' });

      expect(apiClient.post).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/orders`,
        { tradingPartnerId: 'vendor-1' }
      );
      expect(result).toEqual(mockOrderWithItems);
    });
  });

  // ==========================================================================
  // updateOrder - 発注更新
  // ==========================================================================
  describe('updateOrder', () => {
    it('取引先と確定発注金額を更新する', async () => {
      const updated = { ...mockOrderWithItems, confirmedAmount: '850000' };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(updated);

      const result = await updateOrder(projectId, orderId, {
        tradingPartnerId: 'vendor-2',
        confirmedAmount: '850000',
      });

      expect(apiClient.patch).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/orders/${orderId}`,
        { tradingPartnerId: 'vendor-2', confirmedAmount: '850000' }
      );
      expect(result.confirmedAmount).toBe('850000');
    });

    it('発注済ステータスでの編集時に409エラーをスローする', async () => {
      const mockError = new ApiError(409, 'Cannot edit ordered');
      vi.mocked(apiClient.patch).mockRejectedValueOnce(mockError);

      await expect(updateOrder(projectId, orderId, { confirmedAmount: '500000' })).rejects.toThrow(
        ApiError
      );
    });
  });

  // ==========================================================================
  // updateOrderItems - 発注項目更新
  // ==========================================================================
  describe('updateOrderItems', () => {
    it('チェック済み項目のIDリストで発注項目を更新する', async () => {
      const updated = { ...mockOrderWithItems };
      vi.mocked(apiClient.put).mockResolvedValueOnce(updated);

      const result = await updateOrderItems(projectId, orderId, {
        itemIds: ['ebi-1', 'ebi-2'],
      });

      expect(apiClient.put).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/orders/${orderId}/items`,
        { itemIds: ['ebi-1', 'ebi-2'] }
      );
      expect(result).toEqual(updated);
    });
  });

  // ==========================================================================
  // updateOrderStatus - 発注ステータス変更
  // ==========================================================================
  describe('updateOrderStatus', () => {
    it('ステータスを発注済に変更する', async () => {
      const updated = {
        ...mockOrderWithItems,
        status: 'ORDERED' as const,
        confirmedAmount: '850000',
      };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(updated);

      const result = await updateOrderStatus(projectId, orderId, {
        status: 'ORDERED',
        confirmedAmount: '850000',
      });

      expect(apiClient.patch).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/orders/${orderId}/status`,
        { status: 'ORDERED', confirmedAmount: '850000' }
      );
      expect(result.status).toBe('ORDERED');
    });

    it('確定発注金額未入力でORDEREDに変更時に422エラーをスローする', async () => {
      const mockError = new ApiError(422, 'confirmedAmount is required');
      vi.mocked(apiClient.patch).mockRejectedValueOnce(mockError);

      await expect(updateOrderStatus(projectId, orderId, { status: 'ORDERED' })).rejects.toThrow(
        ApiError
      );
    });

    it('ステータスを発注取消に変更する', async () => {
      const updated = {
        ...mockOrderWithItems,
        status: 'CANCELLED' as const,
        confirmedAmount: null,
      };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(updated);

      const result = await updateOrderStatus(projectId, orderId, {
        status: 'CANCELLED',
      });

      expect(result.status).toBe('CANCELLED');
    });
  });

  // ==========================================================================
  // deleteOrder - 発注削除
  // ==========================================================================
  describe('deleteOrder', () => {
    it('発注を削除する', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteOrder(projectId, orderId);

      expect(apiClient.delete).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/orders/${orderId}`
      );
    });

    it('発注済ステータスの発注削除時にエラーをスローする', async () => {
      const mockError = new ApiError(400, 'Cannot delete ordered');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteOrder(projectId, orderId)).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // exportOrder - 発注エクスポート
  // ==========================================================================
  describe('exportOrder', () => {
    it('Excel形式でエクスポートする', async () => {
      const mockBlob = new Blob(['test'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockBlob);

      const result = await exportOrder(projectId, orderId, 'xlsx');

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/orders/${orderId}/export?format=xlsx`
      );
      expect(result).toBeInstanceOf(Blob);
    });

    it('PDF形式でエクスポートする', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockBlob);

      const result = await exportOrder(projectId, orderId, 'pdf');

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/execution-budget/orders/${orderId}/export?format=pdf`
      );
      expect(result).toBeInstanceOf(Blob);
    });
  });
});
