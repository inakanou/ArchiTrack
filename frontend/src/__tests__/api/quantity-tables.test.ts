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
  createQuantityGroup,
  updateQuantityGroup,
  deleteQuantityGroup,
  createQuantityItem,
  updateQuantityItem,
  deleteQuantityItem,
  copyQuantityItem,
  copyQuantityTable,
  copyQuantityGroup,
  createGroupsFromSurvey,
  saveQuantityTableDraft,
} from '../../api/quantity-tables';
import type { SaveQuantityTableDraftInput } from '../../api/quantity-tables';
import type {
  ProjectQuantityTableSummary,
  PaginatedQuantityTables,
  QuantityTableInfo,
  QuantityTableDetail,
  QuantityTableFilter,
  QuantityGroupDetail,
  QuantityGroupInfo,
  CreateGroupsFromSurveyResult,
  QuantityItemDetail,
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

  // ==========================================================================
  // createQuantityGroup - 数量グループ作成
  // ==========================================================================
  describe('createQuantityGroup', () => {
    const mockGroupDetail: QuantityGroupDetail = {
      id: 'group-new',
      quantityTableId: 'qt-1',
      name: '新規グループ',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 0,
      itemCount: 0,
      items: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    it('数量グループを作成できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockGroupDetail);

      const input = { name: '新規グループ', displayOrder: 0 };
      const result = await createQuantityGroup('qt-1', input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/quantity-tables/qt-1/groups', input);
      expect(result).toEqual(mockGroupDetail);
    });

    it('画像IDを指定してグループを作成できること', async () => {
      const groupWithImage = { ...mockGroupDetail, surveyImageId: 'img-1' };
      vi.mocked(apiClient.post).mockResolvedValueOnce(groupWithImage);

      const input = { name: 'グループ', surveyImageId: 'img-1', displayOrder: 1 };
      const result = await createQuantityGroup('qt-1', input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/quantity-tables/qt-1/groups', input);
      expect(result.surveyImageId).toBe('img-1');
    });

    it('数量表が見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '数量表が見つかりません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(createQuantityGroup('non-existent', { displayOrder: 0 })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('バリデーションエラーの場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, 'バリデーションエラー');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(createQuantityGroup('qt-1', { displayOrder: -1 })).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ==========================================================================
  // updateQuantityGroup - 数量グループ更新
  // ==========================================================================
  describe('updateQuantityGroup', () => {
    const mockUpdatedGroup = {
      id: 'group-1',
      quantityTableId: 'qt-1',
      name: '更新されたグループ',
      surveyImageId: 'img-2',
      displayOrder: 1,
      itemCount: 3,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    };

    it('数量グループを更新できること', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockUpdatedGroup);

      const input = { name: '更新されたグループ' };
      const expectedUpdatedAt = '2025-01-01T00:00:00.000Z';
      const result = await updateQuantityGroup('group-1', input, expectedUpdatedAt);

      expect(apiClient.put).toHaveBeenCalledWith('/api/quantity-groups/group-1', {
        ...input,
        expectedUpdatedAt,
      });
      expect(result).toEqual(mockUpdatedGroup);
    });

    it('画像IDを更新できること', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockUpdatedGroup);

      const input = { surveyImageId: 'img-2' };
      const expectedUpdatedAt = '2025-01-01T00:00:00.000Z';
      await updateQuantityGroup('group-1', input, expectedUpdatedAt);

      expect(apiClient.put).toHaveBeenCalledWith('/api/quantity-groups/group-1', {
        ...input,
        expectedUpdatedAt,
      });
    });

    it('楽観的排他制御エラーの場合、409エラーがスローされること', async () => {
      const mockError = new ApiError(409, '競合エラー');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(
        updateQuantityGroup('group-1', { name: '更新' }, '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('グループが見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'グループが見つかりません');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(
        updateQuantityGroup('non-existent', { name: '更新' }, '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ==========================================================================
  // deleteQuantityGroup - 数量グループ削除
  // ==========================================================================
  describe('deleteQuantityGroup', () => {
    it('数量グループを削除できること', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteQuantityGroup('group-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/quantity-groups/group-1');
    });

    it('グループが見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'グループが見つかりません');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteQuantityGroup('non-existent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteQuantityGroup('group-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ==========================================================================
  // createQuantityItem - 数量項目作成
  // ==========================================================================
  describe('createQuantityItem', () => {
    const mockItemDetail: QuantityItemDetail = {
      id: 'item-new',
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
      displayOrder: 0,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    it('数量項目を作成できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockItemDetail);

      const input = {
        majorCategory: '土工',
        workType: '掘削',
        name: '掘削工',
        unit: 'm3',
        quantity: 100,
      };
      const result = await createQuantityItem('group-1', input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/quantity-groups/group-1/items', input);
      expect(result).toEqual(mockItemDetail);
    });

    it('すべてのフィールドを指定して項目を作成できること', async () => {
      const fullItem = {
        ...mockItemDetail,
        middleCategory: '盛土',
        minorCategory: '詳細',
        customCategory: 'カスタム',
        specification: '規格',
        remarks: '備考',
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5, height: 2 },
        adjustmentFactor: 1.1,
        roundingUnit: 0.1,
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce(fullItem);

      const input = {
        majorCategory: '土工',
        middleCategory: '盛土',
        minorCategory: '詳細',
        customCategory: 'カスタム',
        workType: '掘削',
        name: '掘削工',
        specification: '規格',
        unit: 'm3',
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5, height: 2 },
        adjustmentFactor: 1.1,
        roundingUnit: 0.1,
        quantity: 100,
        remarks: '備考',
      };
      const result = await createQuantityItem('group-1', input);

      expect(result.middleCategory).toBe('盛土');
      expect(result.calculationMethod).toBe('AREA_VOLUME');
    });

    it('グループが見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'グループが見つかりません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(
        createQuantityItem('non-existent', {
          majorCategory: '土工',
          workType: '掘削',
          name: '掘削工',
          unit: 'm3',
          quantity: 100,
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('バリデーションエラーの場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '必須フィールドが不足しています');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(
        createQuantityItem('group-1', {
          majorCategory: '',
          workType: '',
          name: '',
          unit: '',
          quantity: 0,
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ==========================================================================
  // updateQuantityItem - 数量項目更新
  // ==========================================================================
  describe('updateQuantityItem', () => {
    const mockUpdatedItem: QuantityItemDetail = {
      id: 'item-1',
      quantityGroupId: 'group-1',
      majorCategory: '土工',
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '掘削',
      name: '更新された項目',
      specification: null,
      unit: 'm3',
      calculationMethod: 'STANDARD',
      calculationParams: null,
      adjustmentFactor: 1,
      roundingUnit: 1,
      quantity: 200,
      remarks: null,
      displayOrder: 0,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    };

    it('数量項目を更新できること', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockUpdatedItem);

      const input = { name: '更新された項目', quantity: 200 };
      const expectedUpdatedAt = '2025-01-01T00:00:00.000Z';
      const result = await updateQuantityItem('item-1', input, expectedUpdatedAt);

      expect(apiClient.put).toHaveBeenCalledWith('/api/quantity-items/item-1', {
        ...input,
        expectedUpdatedAt,
      });
      expect(result).toEqual(mockUpdatedItem);
    });

    it('計算方法とパラメータを更新できること', async () => {
      const itemWithCalc = {
        ...mockUpdatedItem,
        calculationMethod: 'PITCH' as const,
        calculationParams: { rangeLength: 100, pitchLength: 2 },
      };
      vi.mocked(apiClient.put).mockResolvedValueOnce(itemWithCalc);

      const input = {
        calculationMethod: 'PITCH' as const,
        calculationParams: { rangeLength: 100, pitchLength: 2 },
      };
      const result = await updateQuantityItem('item-1', input, '2025-01-01T00:00:00.000Z');

      expect(result.calculationMethod).toBe('PITCH');
      expect(result.calculationParams).toEqual({ rangeLength: 100, pitchLength: 2 });
    });

    it('楽観的排他制御エラーの場合、409エラーがスローされること', async () => {
      const mockError = new ApiError(409, '競合エラー');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(
        updateQuantityItem('item-1', { name: '更新' }, '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('項目が見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '項目が見つかりません');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(
        updateQuantityItem('non-existent', { name: '更新' }, '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('バリデーションエラーの場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '数量が範囲外です');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(
        updateQuantityItem('item-1', { quantity: -99999999999 }, '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ==========================================================================
  // deleteQuantityItem - 数量項目削除
  // ==========================================================================
  describe('deleteQuantityItem', () => {
    it('数量項目を削除できること', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteQuantityItem('item-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/quantity-items/item-1');
    });

    it('項目が見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '項目が見つかりません');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteQuantityItem('non-existent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteQuantityItem('item-1')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteQuantityItem('item-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ==========================================================================
  // copyQuantityItem - 数量項目コピー
  // ==========================================================================
  describe('copyQuantityItem', () => {
    const mockCopiedItem: QuantityItemDetail = {
      id: 'item-copied',
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
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    };

    it('数量項目をコピーできること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockCopiedItem);

      const result = await copyQuantityItem('item-1');

      expect(apiClient.post).toHaveBeenCalledWith('/api/quantity-items/item-1/copy', {});
      expect(result).toEqual(mockCopiedItem);
      expect(result.id).not.toBe('item-1');
    });

    it('コピー元項目が見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '項目が見つかりません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(copyQuantityItem('non-existent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(copyQuantityItem('item-1')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(copyQuantityItem('item-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ==========================================================================
  // copyQuantityTable - 数量表コピー
  // Task 21.2: コピーAPI呼び出し関数を実装する
  // Requirements: 17.2
  // ==========================================================================
  describe('copyQuantityTable', () => {
    const mockCopiedTable: QuantityTableInfo = {
      id: 'qt-copied',
      projectId: 'project-1',
      name: '第1回見積数量表のコピー',
      groupCount: 3,
      itemCount: 15,
      createdAt: '2025-01-05T00:00:00.000Z',
      updatedAt: '2025-01-05T00:00:00.000Z',
    };

    it('数量表をコピーできること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockCopiedTable);

      const result = await copyQuantityTable('qt-1', { name: '第1回見積数量表のコピー' });

      expect(apiClient.post).toHaveBeenCalledWith('/api/quantity-tables/qt-1/copy', {
        name: '第1回見積数量表のコピー',
      });
      expect(result).toEqual(mockCopiedTable);
    });

    it('レスポンスにコピーされた数量表の情報が型安全に含まれること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockCopiedTable);

      const result = await copyQuantityTable('qt-1', { name: 'コピー先名' });

      expect(result.id).toBe('qt-copied');
      expect(result.projectId).toBe('project-1');
      expect(result.name).toBe('第1回見積数量表のコピー');
      expect(result.groupCount).toBe(3);
      expect(result.itemCount).toBe(15);
      expect(typeof result.createdAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');
    });

    it('コピー元の数量表が見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '数量表が見つかりません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(copyQuantityTable('non-existent', { name: 'コピー' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('バリデーションエラーの場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '数量表名は1文字以上200文字以下で入力してください');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(copyQuantityTable('qt-1', { name: '' })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('サーバーエラーの場合、500エラーがスローされること', async () => {
      const mockError = new ApiError(500, 'コピー処理中に予期しないエラーが発生しました');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(copyQuantityTable('qt-1', { name: 'コピー' })).rejects.toMatchObject({
        statusCode: 500,
      });
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(copyQuantityTable('qt-1', { name: 'コピー' })).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(copyQuantityTable('qt-1', { name: 'コピー' })).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ==========================================================================
  // copyQuantityGroup - 数量グループコピー
  // Task 53.1: コピー API クライアントを追加する
  // Requirements: 38.2
  // ==========================================================================
  describe('copyQuantityGroup', () => {
    const mockCopiedGroup: QuantityGroupInfo = {
      id: 'group-copied',
      quantityTableId: 'qt-1',
      name: '元グループ名のコピー',
      surveyImageId: 'img-1',
      displayOrder: 2,
      itemCount: 5,
      createdAt: '2025-01-05T00:00:00.000Z',
      updatedAt: '2025-01-05T00:00:00.000Z',
    };

    it('数量グループをコピーできること（POST /api/quantity-groups/:id/copy が呼び出される）', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockCopiedGroup);

      const result = await copyQuantityGroup('group-1');

      expect(apiClient.post).toHaveBeenCalledWith('/api/quantity-groups/group-1/copy');
      expect(result).toEqual(mockCopiedGroup);
    });

    it('異なるグループ ID を指定した際に URL が正しく構築されること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockCopiedGroup);

      await copyQuantityGroup('another-group-id');

      expect(apiClient.post).toHaveBeenCalledWith('/api/quantity-groups/another-group-id/copy');
    });

    it('レスポンスに QuantityGroupInfo の各フィールドが型安全に含まれること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockCopiedGroup);

      const result = await copyQuantityGroup('group-1');

      expect(result.id).toBe('group-copied');
      expect(result.quantityTableId).toBe('qt-1');
      expect(result.name).toBe('元グループ名のコピー');
      expect(result.surveyImageId).toBe('img-1');
      expect(result.displayOrder).toBe(2);
      expect(result.itemCount).toBe(5);
      expect(typeof result.createdAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');
    });

    it('グループ名が未設定（null）のレスポンスも受け取れること', async () => {
      const groupWithNullName: QuantityGroupInfo = {
        ...mockCopiedGroup,
        name: null,
        surveyImageId: null,
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce(groupWithNullName);

      const result = await copyQuantityGroup('group-1');

      expect(result.name).toBeNull();
      expect(result.surveyImageId).toBeNull();
    });

    it('コピー元グループが見つからない場合、404 エラーが伝搬されること', async () => {
      const mockError = new ApiError(404, 'グループが見つかりません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(copyQuantityGroup('non-existent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('認証エラーの場合、401 エラーが伝搬されること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(copyQuantityGroup('group-1')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403 エラーが伝搬されること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(copyQuantityGroup('group-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('楽観的排他制御競合の場合、409 エラーが伝搬されること', async () => {
      const mockError = new ApiError(409, '他のユーザーが操作中です');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(copyQuantityGroup('group-1')).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('ApiError 以外の例外もそのまま伝搬されること', async () => {
      const originalError = new Error('予期しないエラー');
      vi.mocked(apiClient.post).mockRejectedValueOnce(originalError);

      await expect(copyQuantityGroup('group-1')).rejects.toThrow('予期しないエラー');
    });
  });

  // ==========================================================================
  // createGroupsFromSurvey - 現場調査から数量グループを一括生成
  // ==========================================================================
  describe('createGroupsFromSurvey', () => {
    const mockGroups: QuantityGroupInfo[] = [
      {
        id: 'group-gen-1',
        quantityTableId: 'qt-1',
        name: '現場調査A 1',
        surveyImageId: 'img-1',
        displayOrder: 0,
        itemCount: 0,
        createdAt: '2026-06-04T00:00:00.000Z',
        updatedAt: '2026-06-04T00:00:00.000Z',
      },
      {
        id: 'group-gen-2',
        quantityTableId: 'qt-1',
        name: '現場調査A 2',
        surveyImageId: 'img-2',
        displayOrder: 1,
        itemCount: 0,
        createdAt: '2026-06-04T00:00:00.000Z',
        updatedAt: '2026-06-04T00:00:00.000Z',
      },
    ];
    const mockResult: CreateGroupsFromSurveyResult = {
      created: 2,
      groups: mockGroups,
    };

    it('現場調査から一括生成できること（POST /api/quantity-tables/:tableId/groups/from-survey が正しいボディで呼び出される）', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResult);

      const result = await createGroupsFromSurvey('qt-1', 'survey-1');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/quantity-tables/qt-1/groups/from-survey',
        { siteSurveyId: 'survey-1' }
      );
      expect(result).toEqual(mockResult);
    });

    it('異なる数量表ID・現場調査IDを指定した際に URL とボディが正しく構築されること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResult);

      await createGroupsFromSurvey('another-table', 'another-survey');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/quantity-tables/another-table/groups/from-survey',
        { siteSurveyId: 'another-survey' }
      );
    });

    it('レスポンスに生成件数と数量グループ配列が型安全に含まれること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResult);

      const result = await createGroupsFromSurvey('qt-1', 'survey-1');

      expect(result.created).toBe(2);
      expect(result.groups).toHaveLength(2);
      expect(result.groups[0]?.id).toBe('group-gen-1');
      expect(result.groups[0]?.surveyImageId).toBe('img-1');
      expect(result.groups[1]?.displayOrder).toBe(1);
    });

    it('写真0枚の場合、created:0・groups:[] を受け取れること', async () => {
      const emptyResult: CreateGroupsFromSurveyResult = { created: 0, groups: [] };
      vi.mocked(apiClient.post).mockResolvedValueOnce(emptyResult);

      const result = await createGroupsFromSurvey('qt-1', 'survey-empty');

      expect(result.created).toBe(0);
      expect(result.groups).toEqual([]);
    });

    it('数量表または現場調査が見つからない場合、404 エラーが伝搬されること', async () => {
      const mockError = new ApiError(404, '現場調査が見つかりません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(createGroupsFromSurvey('qt-1', 'non-existent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('認証エラーの場合、401 エラーが伝搬されること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(createGroupsFromSurvey('qt-1', 'survey-1')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403 エラーが伝搬されること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(createGroupsFromSurvey('qt-1', 'survey-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ==========================================================================
  // saveQuantityTableDraft - フル状態同期保存（PUT /api/quantity-tables/:id/save）
  // Task 60.2 / Requirements: 42.5
  // ==========================================================================
  describe('saveQuantityTableDraft', () => {
    // バックエンド saveQuantityTableDraftSchema に完全準拠した入力
    const mockInput: SaveQuantityTableDraftInput = {
      expectedUpdatedAt: '2025-01-02T00:00:00.000Z',
      name: '更新された数量表名',
      groups: [
        {
          // 既存グループ
          id: 'group-1',
          name: 'グループ1',
          surveyImageId: null,
          displayOrder: 0,
          items: [
            {
              // 既存項目（全フィールド）
              id: 'item-1',
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
              displayOrder: 0,
            },
          ],
        },
        {
          // 新規グループ（id=null, tempId 付与）
          id: null,
          tempId: 'tmp-group-1',
          name: '新規グループ',
          surveyImageId: 'image-1',
          displayOrder: 1,
          items: [
            {
              // 新規項目（id=null, tempId 付与, AREA_VOLUME）
              id: null,
              tempId: 'tmp-item-1',
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
              displayOrder: 0,
            },
          ],
        },
      ],
    };

    const mockDetail: QuantityTableDetail = {
      id: 'qt-1',
      projectId: 'project-1',
      project: { id: 'project-1', name: 'テストプロジェクト' },
      name: '更新された数量表名',
      groupCount: 2,
      itemCount: 2,
      groups: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z',
    };

    it('PUT /api/quantity-tables/:id/save に入力ボディを送信し、QuantityTableDetail を返すこと', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockDetail);

      const result = await saveQuantityTableDraft('qt-1', mockInput);

      expect(apiClient.put).toHaveBeenCalledWith('/api/quantity-tables/qt-1/save', mockInput);
      expect(result).toEqual(mockDetail);
    });

    it('バリデーションエラーの場合、400 エラーが伝搬されること', async () => {
      const mockError = new ApiError(400, 'バリデーションエラー');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(saveQuantityTableDraft('qt-1', mockInput)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('楽観的排他競合の場合、409 エラーが伝搬されること', async () => {
      const mockError = new ApiError(409, '競合が発生しました');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(saveQuantityTableDraft('qt-1', mockInput)).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('数量表が見つからない場合、404 エラーが伝搬されること', async () => {
      const mockError = new ApiError(404, '数量表が見つかりません');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(saveQuantityTableDraft('non-existent', mockInput)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('権限不足の場合、403 エラーが伝搬されること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(saveQuantityTableDraft('qt-1', mockInput)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });
});
