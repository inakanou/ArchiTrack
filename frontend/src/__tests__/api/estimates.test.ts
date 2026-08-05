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
 * - REQ-49.3: 転記・案分・利益率・諸経費行追加・値引き行追加はデータベースへ書き込まない
 *
 * `transferFromQuotation` / `addOverheadItem` / `addDiscountItem` は Task 55.7 で撤去した。
 * 対応する書き込み経路が消え、転記・諸経費行追加・値引き行追加はいずれも
 * `estimateEditReducer` の遷移として編集状態へ反映されるようになったため（REQ-49.3）。
 * 個々の関数のテストは削除し、「公開されていないこと」を
 * `撤去済みのAPI関数` で固定する。振る舞いの移行先は
 * `estimateEditReducer.test.ts` の `applyQuotationTransfer` / `addOverheadItem` /
 * 「プリセット値の値引き行をルートレベルの末尾に追加する」。
 *
 * `exportEstimate` / `downloadEstimate` は Task 56.10 で撤去した。出力エンドポイント
 * `GET /api/estimates/:id/export` が消え、帳票（PDF）と表計算（Excel）は画面の
 * 編集中ツリーから生成されるようになったため（REQ-10.1, REQ-10.2）。個々の関数の
 * テストは削除し、振る舞いの移行先は
 * `services/export/EstimatePdfExportService.test.ts`（PDF生成）、
 * `services/export/EstimateExcelExportService.test.ts`（Excel生成）、
 * `components/estimate/EstimateExportDialog.test.tsx`（形式・行タイプの選択と
 * ダウンロードの実行）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import * as estimatesApi from '../../api/estimates';
import {
  getEstimates,
  getEstimatesSummary,
  getEstimateDetail,
  getEstimateItems,
  createEstimate,
  updateEstimate,
  deleteEstimate,
  saveEstimateDraft,
} from '../../api/estimates';
import type {
  EstimatesResponse,
  EstimateSummary,
  EstimateDetail,
  EstimateInfo,
  SaveEstimateDraftRequest,
  SaveEstimateDraftResponse,
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
      // 帳票用入力項目（56.8 で `EstimateDetail` に追加。未入力の見積書を表す）
      reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
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
          itemType: 'STANDARD',
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
  // getEstimateItems - 見積明細を階層構造で取得（Task 53.15）
  // ==========================================================================
  describe('getEstimateItems', () => {
    /**
     * `GET /api/estimates/:id` の `items` は実装上**平坦な配列**で、`children` も
     * `itemType` も持たない（`estimate.service.ts` の `toEstimateDetailInfo`）。
     * 親子関係が必要な場合は `GET /api/estimates/:id/items` を使う。
     *
     * Requirements (estimate-creation):
     * - REQ-2.2: 親項目を持つ見積項目を親項目の子として階層表示する
     * - REQ-34.5: 階層を変更して保存した場合、画面再読み込み後も変更後の構造で表示する
     * - REQ-45.3: ツリー表示では全階層をインデント付きで一覧表示する
     */
    it('明細取得の経路が階層形のエンドポイントであること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce([]);

      await getEstimateItems('est-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/estimates/est-1/items');
    });

    it('親子関係を組んだツリーをそのまま返すこと', async () => {
      const child = {
        id: 'item-child',
        estimateId: 'est-1',
        parentId: 'item-parent',
        displayOrder: 0,
        itemType: 'STANDARD' as const,
        lines: [],
        children: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };
      const tree = [
        {
          id: 'item-parent',
          estimateId: 'est-1',
          parentId: null,
          displayOrder: 0,
          itemType: 'STANDARD' as const,
          lines: [],
          children: [child],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ];
      vi.mocked(apiClient.get).mockResolvedValueOnce(tree);

      const result = await getEstimateItems('est-1');

      expect(result).toHaveLength(1);
      expect(result[0]!.children.map((item) => item.id)).toEqual(['item-child']);
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

  // ==========================================================================
  // 明細の一括保存 (Task 53.5)
  // ==========================================================================

  describe('saveEstimateDraft', () => {
    const savedResponse: SaveEstimateDraftResponse = {
      id: 'est-1',
      projectId: 'proj-1',
      project: { id: 'proj-1', name: 'テストプロジェクト' },
      name: 'テスト見積書',
      sourceItemizedStatementId: null,
      sourceItemizedStatementName: null,
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-16T09:00:00.000Z',
      itemCount: 1,
      reportFields: {
        submissionDate: '2024-01-16',
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['電気設備工事'],
      },
      items: [],
    };

    const request: SaveEstimateDraftRequest = {
      expectedUpdatedAt: '2024-01-15T10:00:00.000Z',
      reportFields: {
        submissionDate: '2024-01-16',
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['電気設備工事'],
      },
      items: [
        {
          id: 'item-1',
          tempId: null,
          itemType: 'STANDARD',
          lines: [
            {
              lineType: 'ESTIMATE',
              name: '仮設工事',
              specification: null,
              unit: '式',
              quantity: '1',
              unitPrice: '100000',
              amount: '100000',
              remarks: null,
              sourceVendorName: null,
            },
          ],
          children: [],
        },
      ],
    };

    /**
     * 42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
     */
    it('PUT /api/estimates/:id/save を1回だけ呼び出しペイロードをそのまま送出すること (42.1)', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(savedResponse);

      const result = await saveEstimateDraft('est-1', request);

      expect(apiClient.put).toHaveBeenCalledTimes(1);
      expect(apiClient.put).toHaveBeenCalledWith('/api/estimates/est-1/save', request);
      expect(result).toEqual(savedResponse);
    });

    /**
     * 42.2: 保存操作が成功した場合、保存後の最新の明細内容を返す
     */
    it('保存後の最新ツリーと帳票用入力項目を返すこと (42.2)', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(savedResponse);

      const result = await saveEstimateDraft('est-1', request);

      expect(result.items).toBe(savedResponse.items);
      expect(result.reportFields).toEqual(savedResponse.reportFields);
      expect(result.updatedAt).toBe('2024-01-16T09:00:00.000Z');
    });

    /**
     * 42.5: 保存開始後に他ユーザーが更新していた場合は保存を中止する（409）
     */
    it('競合時に409のApiErrorがスローされること (42.5)', async () => {
      vi.mocked(apiClient.put).mockRejectedValueOnce(
        new ApiError(409, '他のユーザーによって更新されています')
      );

      await expect(saveEstimateDraft('est-1', request)).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('検証NG時に422のApiErrorがスローされること', async () => {
      vi.mocked(apiClient.put).mockRejectedValueOnce(new ApiError(422, '見積項目の検証に失敗'));

      await expect(saveEstimateDraft('est-1', request)).rejects.toMatchObject({
        statusCode: 422,
      });
    });
  });

  // ============================================================================
  // 撤去したAPI関数 (Task 53.12 / 55.7 / 56.10, REQ-42.1, REQ-49.3, REQ-10.1, REQ-10.2)
  // ============================================================================

  /**
   * 明細の追加・削除・複写・一括更新・並び替え・階層移動は
   * {@link saveEstimateDraft}（`PUT /api/estimates/:id/save`）へ統合したため、
   * 個別に書き込む旧関数はモジュールから撤去されている（Task 53.12）。
   *
   * 転記・諸経費行追加・値引き行追加を書き込む関数も、これらの操作が
   * `estimateEditReducer` による編集状態への反映で完結し、確定は
   * {@link saveEstimateDraft} 1回に集約されたため撤去した（Task 55.7, REQ-49.3）。
   * 関数が残っていれば「実行の時点でデータベースへ書き込まない」を破る経路が
   * 復活しうる。
   *
   * 見積書出力をサーバーへ依頼する関数（`exportEstimate` / `downloadEstimate`）も
   * 撤去した（Task 56.10）。帳票（PDF）と表計算（Excel）は
   * `EstimatePdfExportService` / `EstimateExcelExportService` が画面の編集中ツリーから
   * 生成する。関数が残っていれば、保存済みデータをサーバーから受け取って出力する経路が
   * 復活し、未保存の変更を含む出力（REQ-56.1〜56.3）が成立しなくなる。
   *
   * 「関数が無いこと」は呼び出しでは表現できないため、モジュールの公開名で固定する。
   * あわせて、維持対象の関数が巻き添えで消えていないことも固定する
   * （過剰撤去の検出）。書き込みを伴わない `calculateOverhead` は維持対象で、
   * 撤去した書き込み経路 `addOverheadItem` と取り違えてはならない。
   *
   * Requirements (estimate-creation):
   * - REQ-10.1: PDF出力を選択した場合、建設工事見積書形式のPDFファイルを生成する
   * - REQ-10.2: Excel出力を選択した場合、同じ書式規則のExcelファイルを生成する
   * - REQ-42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
   * - REQ-49.3: これらの操作は実行の時点でデータベースへの書き込みを行わない
   */
  describe('撤去済みのAPI関数 (REQ-42.1, REQ-49.3, REQ-10.1, REQ-10.2)', () => {
    it.each([
      'createEstimateItem',
      'deleteEstimateItem',
      'moveEstimateItem',
      'reorderEstimateItems',
      'batchUpdateEstimateItems',
      'transferFromQuotation',
      'addOverheadItem',
      'addDiscountItem',
      'exportEstimate',
      'downloadEstimate',
    ])('%s が公開されていないこと', (name) => {
      expect(Object.keys(estimatesApi)).not.toContain(name);
    });

    it.each(['saveEstimateDraft', 'getEstimateDetail', 'getEstimateItems', 'calculateOverhead'])(
      '%s は撤去されていないこと',
      (name) => {
        expect(typeof (estimatesApi as Record<string, unknown>)[name]).toBe('function');
      }
    );
  });
});
