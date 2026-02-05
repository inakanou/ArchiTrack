/**
 * @fileoverview 見積書APIクライアントのユニットテスト
 *
 * Task 11: フロントエンドページの実装（API Client）
 *
 * Requirements:
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - REQ-11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - REQ-11.3: 見積書を編集した場合、変更内容を保存する
 * - REQ-11.4: 確認ダイアログを表示後に削除を実行する
 * - REQ-3.1-3.5: 見積書新規作成と内訳書連携
 * - REQ-4.1-4.5: 受領見積書転記
 * - REQ-10.1-10.8: 見積書出力
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getEstimates,
  getEstimatesSummary,
  getEstimateDetail,
  createEstimate,
  updateEstimate,
  deleteEstimate,
  transferFromQuotation,
  exportEstimate,
  downloadEstimate,
} from '../../api/estimates';
import type {
  EstimatesResponse,
  EstimateSummary,
  EstimateDetail,
  EstimateInfo,
  EstimateItemHierarchy,
} from '../../api/estimates';

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

// グローバルfetchモック
const mockFetch = vi.fn();
global.fetch = mockFetch;

// URL.createObjectURLとrevokeObjectURLのモック
const mockCreateObjectURL = vi.fn(() => 'blob:test-url');
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// localStorageモック
const mockLocalStorage = {
  getItem: vi.fn(() => 'test-access-token'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage });

describe('estimates API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('test-access-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getEstimates - 見積書一覧取得
  // ==========================================================================
  describe('getEstimates', () => {
    const mockEstimatesResponse: EstimatesResponse = {
      data: [
        {
          id: 'est-1',
          projectId: 'project-1',
          name: '見積書#1',
          sourceItemizedStatementId: 'is-1',
          sourceItemizedStatementName: '第1回内訳書',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
          totalAmount: '1000000',
        },
        {
          id: 'est-2',
          projectId: 'project-1',
          name: '見積書#2',
          sourceItemizedStatementId: null,
          sourceItemizedStatementName: null,
          createdAt: '2025-01-03T00:00:00.000Z',
          updatedAt: '2025-01-04T00:00:00.000Z',
          totalAmount: null,
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      },
    };

    it('デフォルトパラメータで見積書一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockEstimatesResponse);

      const result = await getEstimates('project-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1/estimates');
      expect(result).toEqual(mockEstimatesResponse);
    });

    it('ページネーションパラメータを指定して見積書一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockEstimatesResponse);

      const result = await getEstimates('project-1', { page: 2, limit: 50 });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/estimates?page=2&limit=50'
      );
      expect(result).toEqual(mockEstimatesResponse);
    });

    it('検索パラメータを指定して見積書一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockEstimatesResponse);

      const result = await getEstimates('project-1', { search: 'テスト' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/estimates?search=%E3%83%86%E3%82%B9%E3%83%88'
      );
      expect(result).toEqual(mockEstimatesResponse);
    });

    it('すべてのオプションを指定して見積書一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockEstimatesResponse);

      const result = await getEstimates('project-1', { page: 1, limit: 10, search: '見積' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/estimates?page=1&limit=10&search=%E8%A6%8B%E7%A9%8D'
      );
      expect(result).toEqual(mockEstimatesResponse);
    });

    it('プロジェクトが見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'プロジェクトが見つかりません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getEstimates('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getEstimates('project-1')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // getEstimatesSummary - 見積書サマリー取得
  // ==========================================================================
  describe('getEstimatesSummary', () => {
    const mockSummary: EstimateSummary = {
      totalCount: 5,
      latestEstimates: [
        {
          id: 'est-1',
          projectId: 'project-1',
          name: '見積書#1',
          sourceItemizedStatementId: null,
          sourceItemizedStatementName: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
      ],
    };

    it('デフォルト件数で見積書サマリーを取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSummary);

      const result = await getEstimatesSummary('project-1');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/estimates/latest?limit=3'
      );
      expect(result).toEqual(mockSummary);
    });

    it('件数を指定して見積書サマリーを取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSummary);

      const result = await getEstimatesSummary('project-1', 5);

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/estimates/latest?limit=5'
      );
      expect(result).toEqual(mockSummary);
    });

    it('APIエラーが発生した場合、エラーがスローされること', async () => {
      const mockError = new ApiError(500, 'Internal Server Error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getEstimatesSummary('project-1')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // getEstimateDetail - 見積書詳細取得
  // ==========================================================================
  describe('getEstimateDetail', () => {
    const mockDetail: EstimateDetail = {
      id: 'est-1',
      projectId: 'project-1',
      name: '見積書#1',
      sourceItemizedStatementId: 'is-1',
      sourceItemizedStatementName: '第1回内訳書',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
      items: [
        {
          id: 'item-1',
          estimateId: 'est-1',
          parentId: null,
          displayOrder: 1,
          lines: [
            {
              id: 'line-1',
              estimateItemId: 'item-1',
              lineType: 'ESTIMATE',
              name: '工事A',
              specification: '規格A',
              unit: '式',
              quantity: '1',
              unitPrice: '100000',
              amount: '100000',
              remarks: null,
              sourceReceivedQuotationLineItemId: null,
              sourceVendorName: null,
              createdAt: '2025-01-01T00:00:00.000Z',
              updatedAt: '2025-01-01T00:00:00.000Z',
            },
          ],
          children: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      totalAmount: '100000',
    };

    it('見積書IDを指定して詳細を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockDetail);

      const result = await getEstimateDetail('est-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/estimates/est-1');
      expect(result).toEqual(mockDetail);
    });

    it('存在しない見積書IDを指定した場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '見積書が見つかりません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getEstimateDetail('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getEstimateDetail('est-1')).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });

  // ==========================================================================
  // createEstimate - 見積書作成
  // ==========================================================================
  describe('createEstimate', () => {
    const mockCreatedEstimate: EstimateInfo = {
      id: 'est-new',
      projectId: 'project-1',
      name: '新規見積書',
      sourceItemizedStatementId: 'is-1',
      sourceItemizedStatementName: '第1回内訳書',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    it('見積書を作成できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockCreatedEstimate);

      const input = {
        name: '新規見積書',
        sourceItemizedStatementId: 'is-1',
      };
      const result = await createEstimate('project-1', input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/projects/project-1/estimates', input);
      expect(result).toEqual(mockCreatedEstimate);
    });

    it('内訳書なしで見積書を作成できること', async () => {
      const mockEstimateWithoutSource: EstimateInfo = {
        ...mockCreatedEstimate,
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockEstimateWithoutSource);

      const input = {
        name: '新規見積書',
      };
      const result = await createEstimate('project-1', input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/projects/project-1/estimates', input);
      expect(result).toEqual(mockEstimateWithoutSource);
    });

    it('バリデーションエラーの場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '見積書名を入力してください');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      try {
        await createEstimate('project-1', { name: '' });
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });

    it('プロジェクトが見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'プロジェクトが見つかりません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(createEstimate('non-existent', { name: '見積書' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(createEstimate('project-1', { name: '見積書' })).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });

  // ==========================================================================
  // updateEstimate - 見積書更新
  // ==========================================================================
  describe('updateEstimate', () => {
    const mockUpdatedEstimate: EstimateInfo = {
      id: 'est-1',
      projectId: 'project-1',
      name: '更新された見積書',
      sourceItemizedStatementId: 'is-1',
      sourceItemizedStatementName: '第1回内訳書',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z',
    };

    it('見積書を更新できること', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockUpdatedEstimate);

      const input = { name: '更新された見積書' };
      const result = await updateEstimate('est-1', input, '2025-01-02T00:00:00.000Z');

      expect(apiClient.put).toHaveBeenCalledWith('/api/estimates/est-1', {
        name: '更新された見積書',
        updatedAt: '2025-01-02T00:00:00.000Z',
      });
      expect(result).toEqual(mockUpdatedEstimate);
    });

    it('存在しない見積書を更新しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '見積書が見つかりません');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(
        updateEstimate('non-existent', { name: '更新' }, '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('楽観的排他制御エラーの場合、409エラーがスローされること', async () => {
      const mockError = new ApiError(409, '他のユーザーにより更新されました');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      try {
        await updateEstimate('est-1', { name: '更新' }, '2025-01-01T00:00:00.000Z');
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
        updateEstimate('est-1', { name: '更新' }, '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  // ==========================================================================
  // deleteEstimate - 見積書削除
  // ==========================================================================
  describe('deleteEstimate', () => {
    it('見積書を削除できること', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteEstimate('est-1', '2025-01-02T00:00:00.000Z');

      expect(apiClient.delete).toHaveBeenCalledWith(
        '/api/estimates/est-1?updatedAt=2025-01-02T00%3A00%3A00.000Z'
      );
    });

    it('存在しない見積書を削除しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '見積書が見つかりません');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      try {
        await deleteEstimate('non-existent', '2025-01-01T00:00:00.000Z');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('楽観的排他制御エラーの場合、409エラーがスローされること', async () => {
      const mockError = new ApiError(409, '他のユーザーにより更新されました');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      try {
        await deleteEstimate('est-1', '2025-01-01T00:00:00.000Z');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(409);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteEstimate('est-1', '2025-01-01T00:00:00.000Z')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteEstimate('est-1', '2025-01-01T00:00:00.000Z')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ==========================================================================
  // transferFromQuotation - 受領見積書転記
  // ==========================================================================
  describe('transferFromQuotation', () => {
    const mockTransferredItems: EstimateItemHierarchy[] = [
      {
        id: 'item-new',
        estimateId: 'est-1',
        parentId: null,
        displayOrder: 1,
        lines: [
          {
            id: 'line-new',
            estimateItemId: 'item-new',
            lineType: 'VENDOR',
            name: '転記された項目',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '50000',
            amount: '50000',
            remarks: null,
            sourceReceivedQuotationLineItemId: 'rq-line-1',
            sourceVendorName: 'テスト業者',
            createdAt: '2025-01-05T00:00:00.000Z',
            updatedAt: '2025-01-05T00:00:00.000Z',
          },
        ],
        children: [],
        createdAt: '2025-01-05T00:00:00.000Z',
        updatedAt: '2025-01-05T00:00:00.000Z',
      },
    ];

    it('受領見積書から見積書に転記できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockTransferredItems);

      const input = {
        receivedQuotationId: 'rq-1',
        lineItemIds: ['rq-line-1', 'rq-line-2'],
      };
      const result = await transferFromQuotation('est-1', input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/estimates/est-1/transfer-quotation', input);
      expect(result).toEqual(mockTransferredItems);
    });

    it('ターゲット見積項目を指定して転記できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockTransferredItems);

      const input = {
        receivedQuotationId: 'rq-1',
        lineItemIds: ['rq-line-1'],
        targetEstimateItemId: 'item-1',
      };
      const result = await transferFromQuotation('est-1', input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/estimates/est-1/transfer-quotation', input);
      expect(result).toEqual(mockTransferredItems);
    });

    it('見積書が見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '見積書が見つかりません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(
        transferFromQuotation('non-existent', {
          receivedQuotationId: 'rq-1',
          lineItemIds: ['rq-line-1'],
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('受領見積書が見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '受領見積書が見つかりません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(
        transferFromQuotation('est-1', {
          receivedQuotationId: 'non-existent',
          lineItemIds: ['rq-line-1'],
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(
        transferFromQuotation('est-1', {
          receivedQuotationId: 'rq-1',
          lineItemIds: ['rq-line-1'],
        })
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  // ==========================================================================
  // exportEstimate - 見積書出力
  // ==========================================================================
  describe('exportEstimate', () => {
    it('PDFフォーマットで見積書を出力できること', async () => {
      const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: vi.fn().mockResolvedValueOnce(mockBlob),
      });

      const result = await exportEstimate('est-1', 'pdf');

      expect(mockFetch).toHaveBeenCalledWith('/api/estimates/est-1/export?format=pdf', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-access-token',
        },
      });
      expect(result).toEqual(mockBlob);
    });

    it('Excelフォーマットで見積書を出力できること', async () => {
      const mockBlob = new Blob(['Excel content'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: vi.fn().mockResolvedValueOnce(mockBlob),
      });

      const result = await exportEstimate('est-1', 'xlsx');

      expect(mockFetch).toHaveBeenCalledWith('/api/estimates/est-1/export?format=xlsx', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-access-token',
        },
      });
      expect(result).toEqual(mockBlob);
    });

    it('出力失敗時にエラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(exportEstimate('est-1', 'pdf')).rejects.toThrow('見積書の出力に失敗しました');
    });

    it('認証トークンがない場合も正常にリクエストされること', async () => {
      mockLocalStorage.getItem.mockReturnValue(null as unknown as string);
      const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: vi.fn().mockResolvedValueOnce(mockBlob),
      });

      const result = await exportEstimate('est-1', 'pdf');

      expect(mockFetch).toHaveBeenCalledWith('/api/estimates/est-1/export?format=pdf', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer null',
        },
      });
      expect(result).toEqual(mockBlob);
    });
  });

  // ==========================================================================
  // downloadEstimate - 見積書ダウンロード
  // ==========================================================================
  describe('downloadEstimate', () => {
    let mockLink: HTMLAnchorElement;
    let appendChildSpy: ReturnType<typeof vi.spyOn>;
    let removeChildSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      } as unknown as HTMLAnchorElement;
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
      appendChildSpy = vi.spyOn(document.body, 'appendChild').mockReturnValue(mockLink);
      removeChildSpy = vi.spyOn(document.body, 'removeChild').mockReturnValue(mockLink);
    });

    it('PDFファイルをダウンロードできること', async () => {
      const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: vi.fn().mockResolvedValueOnce(mockBlob),
      });

      await downloadEstimate('est-1', 'pdf', '見積書.pdf');

      expect(mockFetch).toHaveBeenCalledWith('/api/estimates/est-1/export?format=pdf', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-access-token',
        },
      });
      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
      expect(mockLink.href).toBe('blob:test-url');
      expect(mockLink.download).toBe('見積書.pdf');
      expect(mockLink.click).toHaveBeenCalled();
      expect(appendChildSpy).toHaveBeenCalledWith(mockLink);
      expect(removeChildSpy).toHaveBeenCalledWith(mockLink);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });

    it('Excelファイルをダウンロードできること', async () => {
      const mockBlob = new Blob(['Excel content'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: vi.fn().mockResolvedValueOnce(mockBlob),
      });

      await downloadEstimate('est-1', 'xlsx', '見積書.xlsx');

      expect(mockFetch).toHaveBeenCalledWith('/api/estimates/est-1/export?format=xlsx', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-access-token',
        },
      });
      expect(mockLink.download).toBe('見積書.xlsx');
    });

    it('出力失敗時にエラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(downloadEstimate('est-1', 'pdf', '見積書.pdf')).rejects.toThrow(
        '見積書の出力に失敗しました'
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
        await getEstimateDetail('est-1');
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
        await getEstimateDetail('est-1');
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
        await getEstimates('project-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
        expect((error as ApiError).message).toBe('Request timeout');
      }
    });
  });
});
