/**
 * @fileoverview 見積依頼用APIクライアントのユニットテスト
 *
 * Task 8.1: estimate-requests APIクライアントの実装
 *
 * Requirements:
 * - 3.6: 見積依頼作成（POST /api/projects/:projectId/estimate-requests）
 * - 4.4: 項目選択更新（PATCH /api/estimate-requests/:id/items）
 * - 5.1: Excel出力
 * - 6.1: 見積依頼文取得（GET /api/estimate-requests/:id/text）
 * - 9.3: 見積依頼編集（PATCH /api/estimate-requests/:id）
 * - 9.5: 見積依頼削除（DELETE /api/estimate-requests/:id）
 * - 9.6: 楽観的排他制御エラー（409 Conflict）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getLatestEstimateRequests,
  getEstimateRequests,
  getEstimateRequestDetail,
  getEstimateRequestItems,
  createEstimateRequest,
  updateEstimateRequest,
  updateItemSelection,
  getEstimateRequestText,
  deleteEstimateRequest,
} from '../../api/estimate-requests';
import type {
  ProjectEstimateRequestSummary,
  PaginatedEstimateRequests,
  EstimateRequestInfo,
  ItemWithSelectionInfo,
  EstimateRequestText,
} from '../../types/estimate-request.types';

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

describe('estimate-requests API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getLatestEstimateRequests - 直近N件の見積依頼と総数を取得
  // ==========================================================================
  describe('getLatestEstimateRequests', () => {
    const mockSummary: ProjectEstimateRequestSummary = {
      totalCount: 5,
      latestRequests: [
        {
          id: 'er-1',
          projectId: 'project-1',
          tradingPartnerId: 'tp-1',
          tradingPartnerName: '株式会社ABC工業',
          itemizedStatementId: 'is-1',
          itemizedStatementName: '第1回内訳書',
          name: '見積依頼#1',
          method: 'EMAIL',
          includeBreakdownInBody: false,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
        {
          id: 'er-2',
          projectId: 'project-1',
          tradingPartnerId: 'tp-2',
          tradingPartnerName: '株式会社XYZ建設',
          itemizedStatementId: 'is-1',
          itemizedStatementName: '第1回内訳書',
          name: '見積依頼#2',
          method: 'FAX',
          includeBreakdownInBody: true,
          createdAt: '2025-01-03T00:00:00.000Z',
          updatedAt: '2025-01-04T00:00:00.000Z',
        },
      ],
    };

    it('デフォルト件数（2件）で直近の見積依頼を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSummary);

      const result = await getLatestEstimateRequests('project-1');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/estimate-requests/latest'
      );
      expect(result).toEqual(mockSummary);
    });

    it('件数を指定して直近の見積依頼を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSummary);

      const result = await getLatestEstimateRequests('project-1', 5);

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/estimate-requests/latest?limit=5'
      );
      expect(result).toEqual(mockSummary);
    });

    it('デフォルト件数（2件）を明示的に指定した場合、クエリパラメータが付かないこと', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSummary);

      const result = await getLatestEstimateRequests('project-1', 2);

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/estimate-requests/latest'
      );
      expect(result).toEqual(mockSummary);
    });

    it('プロジェクトが見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'プロジェクトが見つかりません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getLatestEstimateRequests('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getLatestEstimateRequests('project-1')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // getEstimateRequests - 見積依頼一覧取得
  // ==========================================================================
  describe('getEstimateRequests', () => {
    const mockPaginatedRequests: PaginatedEstimateRequests = {
      data: [
        {
          id: 'er-1',
          projectId: 'project-1',
          tradingPartnerId: 'tp-1',
          tradingPartnerName: '株式会社ABC工業',
          itemizedStatementId: 'is-1',
          itemizedStatementName: '第1回内訳書',
          name: '見積依頼#1',
          method: 'EMAIL',
          includeBreakdownInBody: false,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    };

    it('デフォルトパラメータで見積依頼一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedRequests);

      const result = await getEstimateRequests('project-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1/estimate-requests');
      expect(result).toEqual(mockPaginatedRequests);
    });

    it('ページネーションパラメータを指定して見積依頼一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedRequests);

      const result = await getEstimateRequests('project-1', { page: 2, limit: 50 });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/estimate-requests?page=2&limit=50'
      );
      expect(result).toEqual(mockPaginatedRequests);
    });

    it('APIエラーが発生した場合、エラーがスローされること', async () => {
      const mockError = new ApiError(400, 'バリデーションエラー');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getEstimateRequests('project-1')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // getEstimateRequestDetail - 見積依頼詳細取得
  // ==========================================================================
  describe('getEstimateRequestDetail', () => {
    const mockDetail: EstimateRequestInfo = {
      id: 'er-1',
      projectId: 'project-1',
      tradingPartnerId: 'tp-1',
      tradingPartnerName: '株式会社ABC工業',
      itemizedStatementId: 'is-1',
      itemizedStatementName: '第1回内訳書',
      name: '見積依頼#1',
      method: 'EMAIL',
      includeBreakdownInBody: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    };

    it('見積依頼IDを指定して詳細を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockDetail);

      const result = await getEstimateRequestDetail('er-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/estimate-requests/er-1');
      expect(result).toEqual(mockDetail);
    });

    it('存在しない見積依頼IDを指定した場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '見積依頼が見つかりません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getEstimateRequestDetail('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getEstimateRequestDetail('er-1')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getEstimateRequestDetail('er-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ==========================================================================
  // getEstimateRequestItems - 項目一覧取得（選択状態含む）
  // ==========================================================================
  describe('getEstimateRequestItems', () => {
    const mockItems: ItemWithSelectionInfo[] = [
      {
        id: 'item-1',
        estimateRequestItemId: 'eri-1',
        customCategory: '土工',
        workType: '掘削',
        name: '掘削工',
        specification: null,
        unit: 'm3',
        quantity: 100.0,
        displayOrder: 1,
        selected: true,
        otherRequests: [],
      },
      {
        id: 'item-2',
        estimateRequestItemId: 'eri-2',
        customCategory: '土工',
        workType: '盛土',
        name: '盛土工',
        specification: '良質土',
        unit: 'm3',
        quantity: 50.55,
        displayOrder: 2,
        selected: false,
        otherRequests: [
          {
            estimateRequestId: 'er-other',
            estimateRequestName: '見積依頼#2',
            tradingPartnerName: '株式会社ABC工業',
          },
        ],
      },
    ];

    it('見積依頼IDを指定して項目一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockItems);

      const result = await getEstimateRequestItems('er-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/estimate-requests/er-1/items-with-status');
      expect(result).toEqual(mockItems);
    });

    it('存在しない見積依頼IDを指定した場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '見積依頼が見つかりません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getEstimateRequestItems('non-existent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ==========================================================================
  // createEstimateRequest - 見積依頼作成
  // ==========================================================================
  describe('createEstimateRequest', () => {
    const mockCreatedRequest: EstimateRequestInfo = {
      id: 'er-new',
      projectId: 'project-1',
      tradingPartnerId: 'tp-1',
      tradingPartnerName: '株式会社ABC工業',
      itemizedStatementId: 'is-1',
      itemizedStatementName: '第1回内訳書',
      name: '新規見積依頼',
      method: 'EMAIL',
      includeBreakdownInBody: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    it('見積依頼を作成できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockCreatedRequest);

      const input = {
        name: '新規見積依頼',
        tradingPartnerId: 'tp-1',
        itemizedStatementId: 'is-1',
        method: 'EMAIL' as const,
      };
      const result = await createEstimateRequest('project-1', input);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/projects/project-1/estimate-requests',
        input
      );
      expect(result).toEqual(mockCreatedRequest);
    });

    it('バリデーションエラー（見積依頼名未入力）が発生した場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '見積依頼名を入力してください', {
        type: 'validation_error',
        code: 'VALIDATION_ERROR',
      });
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      try {
        await createEstimateRequest('project-1', {
          name: '',
          tradingPartnerId: 'tp-1',
          itemizedStatementId: 'is-1',
          method: 'EMAIL',
        });
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });

    it('取引先が見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '指定された取引先が見つかりません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      try {
        await createEstimateRequest('project-1', {
          name: '見積依頼',
          tradingPartnerId: 'non-existent',
          itemizedStatementId: 'is-1',
          method: 'EMAIL',
        });
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('取引先が協力業者でない場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '取引先は協力業者である必要があります');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(
        createEstimateRequest('project-1', {
          name: '見積依頼',
          tradingPartnerId: 'tp-customer',
          itemizedStatementId: 'is-1',
          method: 'EMAIL',
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(
        createEstimateRequest('project-1', {
          name: '見積依頼',
          tradingPartnerId: 'tp-1',
          itemizedStatementId: 'is-1',
          method: 'EMAIL',
        })
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(
        createEstimateRequest('project-1', {
          name: '見積依頼',
          tradingPartnerId: 'tp-1',
          itemizedStatementId: 'is-1',
          method: 'EMAIL',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // ==========================================================================
  // updateEstimateRequest - 見積依頼更新
  // ==========================================================================
  describe('updateEstimateRequest', () => {
    const mockUpdatedRequest: EstimateRequestInfo = {
      id: 'er-1',
      projectId: 'project-1',
      tradingPartnerId: 'tp-1',
      tradingPartnerName: '株式会社ABC工業',
      itemizedStatementId: 'is-1',
      itemizedStatementName: '第1回内訳書',
      name: '更新した見積依頼',
      method: 'FAX',
      includeBreakdownInBody: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z',
    };

    it('見積依頼を更新できること', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockUpdatedRequest);

      const input = {
        name: '更新した見積依頼',
        method: 'FAX' as const,
        includeBreakdownInBody: true,
      };
      const result = await updateEstimateRequest('er-1', input, '2025-01-02T00:00:00.000Z');

      expect(apiClient.put).toHaveBeenCalledWith('/api/estimate-requests/er-1', {
        ...input,
        expectedUpdatedAt: '2025-01-02T00:00:00.000Z',
      });
      expect(result).toEqual(mockUpdatedRequest);
    });

    it('存在しない見積依頼を更新しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '見積依頼が見つかりません');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(
        updateEstimateRequest('non-existent', { name: '更新' }, '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('楽観的排他制御エラーの場合、409エラーがスローされること', async () => {
      const mockError = new ApiError(
        409,
        '他のユーザーにより更新されました。画面を再読み込みしてください',
        {
          type: 'https://architrack.example.com/problems/estimate-request-conflict',
          code: 'ESTIMATE_REQUEST_CONFLICT',
        }
      );
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      try {
        await updateEstimateRequest('er-1', { name: '更新' }, '2025-01-01T00:00:00.000Z');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(409);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(
        updateEstimateRequest('er-1', { name: '更新' }, '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  // ==========================================================================
  // updateItemSelection - 項目選択状態更新
  // ==========================================================================
  describe('updateItemSelection', () => {
    it('項目の選択状態を更新できること', async () => {
      vi.mocked(apiClient.patch).mockResolvedValueOnce(undefined);

      const items = [
        { itemId: 'item-1', selected: true },
        { itemId: 'item-2', selected: false },
      ];
      await updateItemSelection('er-1', items);

      expect(apiClient.patch).toHaveBeenCalledWith('/api/estimate-requests/er-1/items', {
        items,
      });
    });

    it('存在しない見積依頼の項目を更新しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '見積依頼が見つかりません');
      vi.mocked(apiClient.patch).mockRejectedValueOnce(mockError);

      await expect(
        updateItemSelection('non-existent', [{ itemId: 'item-1', selected: true }])
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.patch).mockRejectedValueOnce(mockError);

      await expect(
        updateItemSelection('er-1', [{ itemId: 'item-1', selected: true }])
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  // ==========================================================================
  // getEstimateRequestText - 見積依頼文取得
  // ==========================================================================
  describe('getEstimateRequestText', () => {
    const mockText: EstimateRequestText = {
      recipient: 'test@example.com',
      subject: '[テストプロジェクト] 御見積依頼',
      body: '株式会社ABC工業 御中\n\n下記の通り御見積をお願い致します。',
    };

    it('見積依頼文を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockText);

      const result = await getEstimateRequestText('er-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/estimate-requests/er-1/text');
      expect(result).toEqual(mockText);
    });

    it('存在しない見積依頼の文を取得しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '見積依頼が見つかりません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getEstimateRequestText('non-existent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('連絡先未登録の場合、422エラーがスローされること', async () => {
      const mockError = new ApiError(422, 'メールアドレスが登録されていません', {
        type: 'https://architrack.example.com/problems/contact-not-registered',
        code: 'CONTACT_NOT_REGISTERED',
      });
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getEstimateRequestText('er-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(422);
      }
    });
  });

  // ==========================================================================
  // deleteEstimateRequest - 見積依頼削除
  // ==========================================================================
  describe('deleteEstimateRequest', () => {
    it('見積依頼を削除できること', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteEstimateRequest('er-1', '2025-01-02T00:00:00.000Z');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/estimate-requests/er-1', {
        body: { updatedAt: '2025-01-02T00:00:00.000Z' },
      });
    });

    it('存在しない見積依頼を削除しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '見積依頼が見つかりません', {
        type: 'https://architrack.example.com/problems/estimate-request-not-found',
        code: 'ESTIMATE_REQUEST_NOT_FOUND',
      });
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      try {
        await deleteEstimateRequest('non-existent', '2025-01-01T00:00:00.000Z');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('楽観的排他制御エラーの場合、409エラーがスローされること', async () => {
      const mockError = new ApiError(
        409,
        '他のユーザーにより更新されました。画面を再読み込みしてください',
        {
          type: 'https://architrack.example.com/problems/estimate-request-conflict',
          code: 'ESTIMATE_REQUEST_CONFLICT',
        }
      );
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      try {
        await deleteEstimateRequest('er-1', '2025-01-01T00:00:00.000Z');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(409);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteEstimateRequest('er-1', '2025-01-01T00:00:00.000Z')).rejects.toMatchObject(
        { statusCode: 401 }
      );
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteEstimateRequest('er-1', '2025-01-01T00:00:00.000Z')).rejects.toMatchObject(
        { statusCode: 403 }
      );
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
        await getEstimateRequestDetail('er-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
        expect((error as ApiError).message).toBe('Network error');
      }
    });

    it('サーバーエラー（5xx）の場合、適切なApiErrorがスローされること', async () => {
      const mockError = new ApiError(500, 'Internal Server Error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getEstimateRequestDetail('er-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
      }
    });

    it('タイムアウトエラーの場合、statusCode 0のApiErrorがスローされること', async () => {
      const mockError = new ApiError(0, 'Request timeout');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getEstimateRequests('project-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
        expect((error as ApiError).message).toBe('Request timeout');
      }
    });
  });
});
