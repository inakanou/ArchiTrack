/**
 * @fileoverview ステータス管理APIクライアントのユニットテスト
 *
 * Task 17.2: ステータス管理APIクライアントの実装
 *
 * Requirements:
 * - 12.9: ステータス遷移
 * - 12.11: ステータス変更履歴
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  transitionStatus,
  getStatusHistory,
  getStatusLabel,
  getAllowedTransitions,
} from '../../api/estimate-request-status';
import type {
  StatusTransitionResult,
  EstimateRequestStatusHistory,
} from '../../api/estimate-request-status';

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

describe('estimate-request-status API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // transitionStatus - ステータス遷移
  // ==========================================================================
  describe('transitionStatus', () => {
    const mockResult: StatusTransitionResult = {
      id: 'er-1',
      status: 'REQUESTED',
      updatedAt: new Date('2025-01-20T00:00:00.000Z'),
    };

    it('ステータスを遷移できること（依頼前 -> 依頼済）', async () => {
      const mockResponse = {
        ...mockResult,
        updatedAt: '2025-01-20T00:00:00.000Z',
      };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(mockResponse);

      const result = await transitionStatus('er-1', 'REQUESTED');

      expect(apiClient.patch).toHaveBeenCalledWith('/api/estimate-requests/er-1/status', {
        status: 'REQUESTED',
      });
      expect(result.id).toBe('er-1');
      expect(result.status).toBe('REQUESTED');
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('ステータスを遷移できること（依頼済 -> 見積受領済）', async () => {
      const mockResponse = {
        id: 'er-1',
        status: 'QUOTATION_RECEIVED',
        updatedAt: '2025-01-21T00:00:00.000Z',
      };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(mockResponse);

      const result = await transitionStatus('er-1', 'QUOTATION_RECEIVED');

      expect(apiClient.patch).toHaveBeenCalledWith('/api/estimate-requests/er-1/status', {
        status: 'QUOTATION_RECEIVED',
      });
      expect(result.status).toBe('QUOTATION_RECEIVED');
    });

    it('ステータスを遷移できること（見積受領済 -> 依頼済）', async () => {
      const mockResponse = {
        id: 'er-1',
        status: 'REQUESTED',
        updatedAt: '2025-01-22T00:00:00.000Z',
      };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(mockResponse);

      const result = await transitionStatus('er-1', 'REQUESTED');

      expect(result.status).toBe('REQUESTED');
    });

    it('存在しない見積依頼のステータスを遷移しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '見積依頼が見つかりません');
      vi.mocked(apiClient.patch).mockRejectedValueOnce(mockError);

      await expect(transitionStatus('non-existent', 'REQUESTED')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('無効なステータス遷移の場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '依頼前から見積受領済への遷移は許可されていません', {
        type: 'https://architrack.example.com/problems/invalid-status-transition',
        code: 'INVALID_STATUS_TRANSITION',
        details: {
          currentStatus: 'BEFORE_REQUEST',
          targetStatus: 'QUOTATION_RECEIVED',
        },
      });
      vi.mocked(apiClient.patch).mockRejectedValueOnce(mockError);

      try {
        await transitionStatus('er-1', 'QUOTATION_RECEIVED');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.patch).mockRejectedValueOnce(mockError);

      await expect(transitionStatus('er-1', 'REQUESTED')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.patch).mockRejectedValueOnce(mockError);

      await expect(transitionStatus('er-1', 'REQUESTED')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ==========================================================================
  // getStatusHistory - ステータス変更履歴取得
  // ==========================================================================
  describe('getStatusHistory', () => {
    const mockHistory: EstimateRequestStatusHistory[] = [
      {
        id: 'history-1',
        estimateRequestId: 'er-1',
        fromStatus: null,
        toStatus: 'BEFORE_REQUEST',
        changedById: 'user-1',
        changedAt: new Date('2025-01-10T00:00:00.000Z'),
        changedBy: {
          id: 'user-1',
          displayName: '山田太郎',
        },
      },
      {
        id: 'history-2',
        estimateRequestId: 'er-1',
        fromStatus: 'BEFORE_REQUEST',
        toStatus: 'REQUESTED',
        changedById: 'user-1',
        changedAt: new Date('2025-01-15T00:00:00.000Z'),
        changedBy: {
          id: 'user-1',
          displayName: '山田太郎',
        },
      },
    ];

    it('ステータス変更履歴を取得できること', async () => {
      const mockResponse = mockHistory.map((h) => ({
        ...h,
        changedAt: h.changedAt.toISOString(),
      }));
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      const result = await getStatusHistory('er-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/estimate-requests/er-1/status-history');
      expect(result).toHaveLength(2);
      expect(result[0]?.changedAt).toBeInstanceOf(Date);
      expect(result[0]?.changedBy?.displayName).toBe('山田太郎');
    });

    it('履歴が空の場合、空配列を返すこと', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce([]);

      const result = await getStatusHistory('er-new');

      expect(result).toEqual([]);
    });

    it('存在しない見積依頼の履歴を取得しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '見積依頼が見つかりません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getStatusHistory('non-existent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getStatusHistory('er-1')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getStatusHistory('er-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ==========================================================================
  // getStatusLabel - ステータスラベル取得
  // ==========================================================================
  describe('getStatusLabel', () => {
    it('依頼前のラベルを取得できること', () => {
      expect(getStatusLabel('BEFORE_REQUEST')).toBe('依頼前');
    });

    it('依頼済のラベルを取得できること', () => {
      expect(getStatusLabel('REQUESTED')).toBe('依頼済');
    });

    it('見積受領済のラベルを取得できること', () => {
      expect(getStatusLabel('QUOTATION_RECEIVED')).toBe('見積受領済');
    });
  });

  // ==========================================================================
  // getAllowedTransitions - 許可されるステータス遷移先取得
  // ==========================================================================
  describe('getAllowedTransitions', () => {
    it('依頼前からは依頼済への遷移が許可されること', () => {
      const allowed = getAllowedTransitions('BEFORE_REQUEST');
      expect(allowed).toEqual(['REQUESTED']);
    });

    it('依頼済からは見積受領済への遷移が許可されること', () => {
      const allowed = getAllowedTransitions('REQUESTED');
      expect(allowed).toEqual(['QUOTATION_RECEIVED']);
    });

    it('見積受領済からは依頼済への遷移が許可されること', () => {
      const allowed = getAllowedTransitions('QUOTATION_RECEIVED');
      expect(allowed).toEqual(['REQUESTED']);
    });
  });

  // ==========================================================================
  // エラーハンドリング
  // ==========================================================================
  describe('エラーハンドリング', () => {
    it('ネットワークエラーの場合、statusCode 0のApiErrorがスローされること', async () => {
      const mockError = new ApiError(0, 'Network error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getStatusHistory('er-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
      }
    });

    it('サーバーエラー（5xx）の場合、適切なApiErrorがスローされること', async () => {
      const mockError = new ApiError(500, 'Internal Server Error');
      vi.mocked(apiClient.patch).mockRejectedValueOnce(mockError);

      try {
        await transitionStatus('er-1', 'REQUESTED');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
      }
    });

    it('タイムアウトエラーの場合、statusCode 0のApiErrorがスローされること', async () => {
      const mockError = new ApiError(0, 'Request timeout');
      vi.mocked(apiClient.patch).mockRejectedValueOnce(mockError);

      try {
        await transitionStatus('er-1', 'REQUESTED');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
        expect((error as ApiError).message).toBe('Request timeout');
      }
    });
  });
});
