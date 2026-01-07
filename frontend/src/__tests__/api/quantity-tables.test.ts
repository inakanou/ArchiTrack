/**
 * @fileoverview 数量表用APIクライアントのユニットテスト
 *
 * Task 4.1: 数量表APIクライアントの実装
 *
 * Requirements:
 * - 1.2: GET /api/projects/:projectId/quantity-tables/summary 直近N件と総数取得
 * - 2.3: GET /api/projects/:projectId/quantity-tables 数量表一覧取得
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getLatestQuantityTables,
  getQuantityTables,
  getQuantityTable,
  getQuantityTableDetail,
  createQuantityTable,
  updateQuantityTable,
  deleteQuantityTable,
} from '../../api/quantity-tables';
import type {
  ProjectQuantityTableSummary,
  PaginatedQuantityTables,
  QuantityTableInfo,
  QuantityTableDetail,
  QuantityTableFilter,
} from '../../types/quantity-table.types';

// モック設定
vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe('quantity-tables API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getLatestQuantityTables - 直近N件の数量表と総数を取得
  // ==========================================================================
  describe('getLatestQuantityTables', () => {
    const mockSummary: ProjectQuantityTableSummary = {
      totalCount: 5,
      latestTables: [
        {
          id: 'qt-1',
          projectId: 'project-1',
          name: '第1回見積数量表',
          groupCount: 3,
          itemCount: 15,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
        {
          id: 'qt-2',
          projectId: 'project-1',
          name: '第2回見積数量表',
          groupCount: 2,
          itemCount: 10,
          createdAt: '2025-01-03T00:00:00.000Z',
          updatedAt: '2025-01-04T00:00:00.000Z',
        },
      ],
    };

    it('デフォルト件数（2件）で直近の数量表を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSummary);

      const result = await getLatestQuantityTables('project-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1/quantity-tables/summary');
      expect(result).toEqual(mockSummary);
    });

    it('件数を指定して直近の数量表を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSummary);

      const result = await getLatestQuantityTables('project-1', 5);

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/quantity-tables/summary?limit=5'
      );
      expect(result).toEqual(mockSummary);
    });

    it('デフォルト件数（2件）を明示的に指定した場合、クエリパラメータが付かないこと', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSummary);

      const result = await getLatestQuantityTables('project-1', 2);

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1/quantity-tables/summary');
      expect(result).toEqual(mockSummary);
    });

    it('プロジェクトが見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'プロジェクトが見つかりません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getLatestQuantityTables('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getLatestQuantityTables('project-1')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // getQuantityTables - 数量表一覧取得
  // ==========================================================================
  describe('getQuantityTables', () => {
    const mockPaginatedTables: PaginatedQuantityTables = {
      data: [
        {
          id: 'qt-1',
          projectId: 'project-1',
          name: '第1回見積数量表',
          groupCount: 3,
          itemCount: 15,
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

    it('デフォルトパラメータで数量表一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedTables);

      const result = await getQuantityTables('project-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1/quantity-tables');
      expect(result).toEqual(mockPaginatedTables);
    });

    it('ページネーションパラメータを指定して数量表一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedTables);

      const result = await getQuantityTables('project-1', { page: 2, limit: 50 });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/quantity-tables?page=2&limit=50'
      );
      expect(result).toEqual(mockPaginatedTables);
    });

    it('検索キーワードを指定して数量表一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedTables);

      const filter: QuantityTableFilter = { search: '見積' };
      const result = await getQuantityTables('project-1', { filter });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/quantity-tables?search=%E8%A6%8B%E7%A9%8D'
      );
      expect(result).toEqual(mockPaginatedTables);
    });

    it('ソートパラメータを指定して数量表一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedTables);

      const result = await getQuantityTables('project-1', { sort: 'createdAt', order: 'desc' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/quantity-tables?sort=createdAt&order=desc'
      );
      expect(result).toEqual(mockPaginatedTables);
    });

    it('すべてのパラメータを組み合わせて数量表一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedTables);

      const filter: QuantityTableFilter = { search: 'テスト' };
      const result = await getQuantityTables('project-1', {
        page: 1,
        limit: 20,
        filter,
        sort: 'updatedAt',
        order: 'asc',
      });

      expect(apiClient.get).toHaveBeenCalled();
      expect(result).toEqual(mockPaginatedTables);
    });

    it('空のフィルタを指定した場合、検索パラメータが付かないこと', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedTables);

      const filter: QuantityTableFilter = {};
      const result = await getQuantityTables('project-1', { filter });

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1/quantity-tables');
      expect(result).toEqual(mockPaginatedTables);
    });

    it('APIエラーが発生した場合、エラーがスローされること', async () => {
      const mockError = new ApiError(400, 'バリデーションエラー');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getQuantityTables('project-1')).rejects.toThrow(ApiError);
    });

    it('ネットワークエラーが発生した場合、エラーがスローされること', async () => {
      const mockError = new ApiError(0, 'Network error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getQuantityTables('project-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
      }
    });
  });

  // ==========================================================================
  // getQuantityTable - 数量表詳細取得（簡易版）
  // ==========================================================================
  describe('getQuantityTable', () => {
    const mockQuantityTable: QuantityTableInfo = {
      id: 'qt-1',
      projectId: 'project-1',
      name: '第1回見積数量表',
      groupCount: 3,
      itemCount: 15,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    };

    it('数量表IDを指定して数量表情報を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockQuantityTable);

      const result = await getQuantityTable('qt-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/quantity-tables/qt-1');
      expect(result).toEqual(mockQuantityTable);
    });

    it('存在しない数量表IDを指定した場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '数量表が見つかりません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getQuantityTable('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getQuantityTable('qt-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(401);
      }
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getQuantityTable('qt-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(403);
      }
    });
  });

  // ==========================================================================
  // getQuantityTableDetail - 数量表詳細取得（グループ・項目を含む）
  // ==========================================================================
  describe('getQuantityTableDetail', () => {
    const mockQuantityTableDetail: QuantityTableDetail = {
      id: 'qt-1',
      projectId: 'project-1',
      project: { id: 'project-1', name: 'テストプロジェクト' },
      name: '第1回見積数量表',
      groupCount: 1,
      itemCount: 2,
      groups: [
        {
          id: 'group-1',
          quantityTableId: 'qt-1',
          name: 'グループ1',
          surveyImageId: null,
          surveyImage: null,
          displayOrder: 1,
          itemCount: 2,
          items: [
            {
              id: 'item-1',
              quantityGroupId: 'group-1',
              majorCategory: '土工',
              middleCategory: null,
              minorCategory: null,
              customCategory: null,
              workType: '掘削',
              name: '掘削工',
              specification: null,
              unit: 'm3',
              calculationMethod: 'STANDARD',
              calculationParams: null,
              adjustmentFactor: 1,
              roundingUnit: 1,
              quantity: 100,
              remarks: null,
              displayOrder: 1,
              createdAt: '2025-01-01T00:00:00.000Z',
              updatedAt: '2025-01-01T00:00:00.000Z',
            },
            {
              id: 'item-2',
              quantityGroupId: 'group-1',
              majorCategory: '土工',
              middleCategory: '盛土',
              minorCategory: null,
              customCategory: null,
              workType: '盛土工',
              name: '盛土',
              specification: '良質土',
              unit: 'm3',
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 10, depth: 5, height: 2 },
              adjustmentFactor: 1.1,
              roundingUnit: 0.1,
              quantity: 110,
              remarks: '備考テスト',
              displayOrder: 2,
              createdAt: '2025-01-01T00:00:00.000Z',
              updatedAt: '2025-01-01T00:00:00.000Z',
            },
          ],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    };

    it('数量表IDを指定して数量表詳細を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockQuantityTableDetail);

      const result = await getQuantityTableDetail('qt-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/quantity-tables/qt-1');
      expect(result).toEqual(mockQuantityTableDetail);
    });

    it('存在しない数量表IDを指定した場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '数量表が見つかりません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getQuantityTableDetail('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getQuantityTableDetail('qt-1')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getQuantityTableDetail('qt-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ==========================================================================
  // createQuantityTable - 数量表作成
  // ==========================================================================
  describe('createQuantityTable', () => {
    const mockQuantityTableInfo: QuantityTableInfo = {
      id: 'qt-new',
      projectId: 'project-1',
      name: '新規数量表',
      groupCount: 0,
      itemCount: 0,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    it('数量表を作成できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockQuantityTableInfo);

      const input = { name: '新規数量表' };
      const result = await createQuantityTable('project-1', input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/projects/project-1/quantity-tables', input);
      expect(result).toEqual(mockQuantityTableInfo);
    });

    it('バリデーションエラーが発生した場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '数量表名は必須です');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      const input = { name: '' };

      try {
        await createQuantityTable('project-1', input);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(createQuantityTable('project-1', { name: 'テスト' })).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(createQuantityTable('project-1', { name: 'テスト' })).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('プロジェクトが見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'プロジェクトが見つかりません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      try {
        await createQuantityTable('non-existent', { name: 'テスト' });
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });
  });

  // ==========================================================================
  // updateQuantityTable - 数量表更新
  // ==========================================================================
  describe('updateQuantityTable', () => {
    const mockQuantityTableInfo: QuantityTableInfo = {
      id: 'qt-1',
      projectId: 'project-1',
      name: '更新された数量表',
      groupCount: 3,
      itemCount: 15,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z',
    };

    it('数量表を更新できること', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockQuantityTableInfo);

      const input = { name: '更新された数量表' };
      const expectedUpdatedAt = '2025-01-02T00:00:00.000Z';
      const result = await updateQuantityTable('qt-1', input, expectedUpdatedAt);

      expect(apiClient.put).toHaveBeenCalledWith('/api/quantity-tables/qt-1', {
        ...input,
        expectedUpdatedAt,
      });
      expect(result).toEqual(mockQuantityTableInfo);
    });

    it('楽観的排他制御エラーが発生した場合、409エラーがスローされること', async () => {
      const mockError = new ApiError(409, '数量表は他のユーザーによって更新されました');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      const input = { name: '更新' };
      const expectedUpdatedAt = '2025-01-01T00:00:00.000Z';

      try {
        await updateQuantityTable('qt-1', input, expectedUpdatedAt);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(409);
      }
    });

    it('存在しない数量表を更新しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '数量表が見つかりません');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      const input = { name: '更新' };
      const expectedUpdatedAt = '2025-01-01T00:00:00.000Z';

      try {
        await updateQuantityTable('non-existent', input, expectedUpdatedAt);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('バリデーションエラーが発生した場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '数量表名が長すぎます');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      const input = { name: 'a'.repeat(201) };
      const expectedUpdatedAt = '2025-01-01T00:00:00.000Z';

      await expect(updateQuantityTable('qt-1', input, expectedUpdatedAt)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(
        updateQuantityTable('qt-1', { name: 'テスト' }, '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(
        updateQuantityTable('qt-1', { name: 'テスト' }, '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ==========================================================================
  // deleteQuantityTable - 数量表削除
  // ==========================================================================
  describe('deleteQuantityTable', () => {
    it('数量表を削除できること', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteQuantityTable('qt-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/quantity-tables/qt-1');
    });

    it('存在しない数量表を削除しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '数量表が見つかりません');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      try {
        await deleteQuantityTable('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteQuantityTable('qt-1')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteQuantityTable('qt-1')).rejects.toMatchObject({
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
        await getQuantityTable('qt-1');
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
        await getQuantityTable('qt-1');
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
        await getQuantityTables('project-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
        expect((error as ApiError).message).toBe('Request timeout');
      }
    });
  });
});
