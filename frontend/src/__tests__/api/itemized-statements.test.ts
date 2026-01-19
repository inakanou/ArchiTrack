/**
 * @fileoverview 内訳書用APIクライアントのユニットテスト
 *
 * Task 4.1: 内訳書APIクライアントの実装
 *
 * Requirements:
 * - 1.3: 内訳書作成（POST /api/projects/:projectId/itemized-statements）
 * - 3.4: 内訳書一覧取得（GET /api/projects/:projectId/itemized-statements）
 * - 3.5: 内訳書詳細画面への遷移
 * - 4.1: 内訳書詳細取得（GET /api/itemized-statements/:id）
 * - 7.3: 内訳書削除（DELETE /api/itemized-statements/:id）
 * - 10.4: 楽観的排他制御エラー（409 Conflict）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getLatestItemizedStatements,
  getItemizedStatements,
  getItemizedStatementDetail,
  createItemizedStatement,
  deleteItemizedStatement,
} from '../../api/itemized-statements';
import type {
  ProjectItemizedStatementSummary,
  PaginatedItemizedStatements,
  ItemizedStatementDetail,
  ItemizedStatementInfo,
} from '../../types/itemized-statement.types';

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

describe('itemized-statements API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getLatestItemizedStatements - 直近N件の内訳書と総数を取得
  // ==========================================================================
  describe('getLatestItemizedStatements', () => {
    const mockSummary: ProjectItemizedStatementSummary = {
      totalCount: 5,
      latestStatements: [
        {
          id: 'is-1',
          projectId: 'project-1',
          name: '第1回内訳書',
          sourceQuantityTableId: 'qt-1',
          sourceQuantityTableName: '数量表1',
          itemCount: 15,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
        {
          id: 'is-2',
          projectId: 'project-1',
          name: '第2回内訳書',
          sourceQuantityTableId: 'qt-2',
          sourceQuantityTableName: '数量表2',
          itemCount: 10,
          createdAt: '2025-01-03T00:00:00.000Z',
          updatedAt: '2025-01-04T00:00:00.000Z',
        },
      ],
    };

    it('デフォルト件数（2件）で直近の内訳書を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSummary);

      const result = await getLatestItemizedStatements('project-1');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/itemized-statements/latest'
      );
      expect(result).toEqual(mockSummary);
    });

    it('件数を指定して直近の内訳書を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSummary);

      const result = await getLatestItemizedStatements('project-1', 5);

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/itemized-statements/latest?limit=5'
      );
      expect(result).toEqual(mockSummary);
    });

    it('デフォルト件数（2件）を明示的に指定した場合、クエリパラメータが付かないこと', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSummary);

      const result = await getLatestItemizedStatements('project-1', 2);

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/itemized-statements/latest'
      );
      expect(result).toEqual(mockSummary);
    });

    it('プロジェクトが見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'プロジェクトが見つかりません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getLatestItemizedStatements('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getLatestItemizedStatements('project-1')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // getItemizedStatements - 内訳書一覧取得
  // ==========================================================================
  describe('getItemizedStatements', () => {
    const mockPaginatedStatements: PaginatedItemizedStatements = {
      data: [
        {
          id: 'is-1',
          projectId: 'project-1',
          name: '第1回内訳書',
          sourceQuantityTableId: 'qt-1',
          sourceQuantityTableName: '数量表1',
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

    it('デフォルトパラメータで内訳書一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedStatements);

      const result = await getItemizedStatements('project-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1/itemized-statements');
      expect(result).toEqual(mockPaginatedStatements);
    });

    it('ページネーションパラメータを指定して内訳書一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedStatements);

      const result = await getItemizedStatements('project-1', { page: 2, limit: 50 });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/itemized-statements?page=2&limit=50'
      );
      expect(result).toEqual(mockPaginatedStatements);
    });

    it('検索キーワードを指定して内訳書一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedStatements);

      const result = await getItemizedStatements('project-1', { search: '内訳' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/itemized-statements?search=%E5%86%85%E8%A8%B3'
      );
      expect(result).toEqual(mockPaginatedStatements);
    });

    it('ソートパラメータを指定して内訳書一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedStatements);

      const result = await getItemizedStatements('project-1', { sort: 'createdAt', order: 'desc' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/itemized-statements?sort=createdAt&order=desc'
      );
      expect(result).toEqual(mockPaginatedStatements);
    });

    it('すべてのパラメータを組み合わせて内訳書一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedStatements);

      const result = await getItemizedStatements('project-1', {
        page: 1,
        limit: 20,
        search: 'テスト',
        sort: 'name',
        order: 'asc',
      });

      expect(apiClient.get).toHaveBeenCalled();
      expect(result).toEqual(mockPaginatedStatements);
    });

    it('APIエラーが発生した場合、エラーがスローされること', async () => {
      const mockError = new ApiError(400, 'バリデーションエラー');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getItemizedStatements('project-1')).rejects.toThrow(ApiError);
    });

    it('ネットワークエラーが発生した場合、エラーがスローされること', async () => {
      const mockError = new ApiError(0, 'Network error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getItemizedStatements('project-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
      }
    });
  });

  // ==========================================================================
  // getItemizedStatementDetail - 内訳書詳細取得
  // ==========================================================================
  describe('getItemizedStatementDetail', () => {
    const mockDetail: ItemizedStatementDetail = {
      id: 'is-1',
      projectId: 'project-1',
      project: { id: 'project-1', name: 'テストプロジェクト' },
      name: '第1回内訳書',
      sourceQuantityTableId: 'qt-1',
      sourceQuantityTableName: '数量表1',
      itemCount: 2,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
      items: [
        {
          id: 'item-1',
          customCategory: '土工',
          workType: '掘削',
          name: '掘削工',
          specification: null,
          unit: 'm3',
          quantity: 100.0,
        },
        {
          id: 'item-2',
          customCategory: '土工',
          workType: '盛土',
          name: '盛土工',
          specification: '良質土',
          unit: 'm3',
          quantity: 50.55,
        },
      ],
    };

    it('内訳書IDを指定して詳細を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockDetail);

      const result = await getItemizedStatementDetail('is-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/itemized-statements/is-1');
      expect(result).toEqual(mockDetail);
    });

    it('存在しない内訳書IDを指定した場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '内訳書が見つかりません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      try {
        await getItemizedStatementDetail('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getItemizedStatementDetail('is-1')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getItemizedStatementDetail('is-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ==========================================================================
  // createItemizedStatement - 内訳書作成
  // ==========================================================================
  describe('createItemizedStatement', () => {
    const mockCreatedStatement: ItemizedStatementInfo = {
      id: 'is-new',
      projectId: 'project-1',
      name: '新規内訳書',
      sourceQuantityTableId: 'qt-1',
      sourceQuantityTableName: '数量表1',
      itemCount: 10,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    it('内訳書を作成できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockCreatedStatement);

      const input = { name: '新規内訳書', quantityTableId: 'qt-1' };
      const result = await createItemizedStatement('project-1', input);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/projects/project-1/itemized-statements',
        input
      );
      expect(result).toEqual(mockCreatedStatement);
    });

    it('バリデーションエラー（内訳書名未入力）が発生した場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '内訳書名を入力してください', {
        type: 'validation_error',
        code: 'VALIDATION_ERROR',
      });
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      try {
        await createItemizedStatement('project-1', { name: '', quantityTableId: 'qt-1' });
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });

    it('バリデーションエラー（数量表未選択）が発生した場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '数量表を選択してください', {
        type: 'validation_error',
        code: 'VALIDATION_ERROR',
      });
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      try {
        await createItemizedStatement('project-1', { name: '内訳書', quantityTableId: '' });
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });

    it('数量表が見つからない場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '指定された数量表が見つかりません', {
        type: 'https://architrack.example.com/problems/quantity-table-not-found',
        code: 'QUANTITY_TABLE_NOT_FOUND',
      });
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      try {
        await createItemizedStatement('project-1', {
          name: '内訳書',
          quantityTableId: 'non-existent',
        });
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });

    it('数量表に項目がない場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '選択された数量表に項目がありません', {
        type: 'https://architrack.example.com/problems/empty-quantity-items',
        code: 'EMPTY_QUANTITY_ITEMS',
      });
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      try {
        await createItemizedStatement('project-1', { name: '内訳書', quantityTableId: 'qt-empty' });
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });

    it('同名の内訳書が存在する場合、409エラーがスローされること', async () => {
      const mockError = new ApiError(409, '同名の内訳書が既に存在します', {
        type: 'https://architrack.example.com/problems/duplicate-itemized-statement-name',
        code: 'DUPLICATE_ITEMIZED_STATEMENT_NAME',
      });
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      try {
        await createItemizedStatement('project-1', { name: '既存内訳書', quantityTableId: 'qt-1' });
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(409);
      }
    });

    it('オーバーフローエラーが発生した場合、422エラーがスローされること', async () => {
      const mockError = new ApiError(422, '数量の合計が許容範囲を超えています', {
        type: 'https://architrack.example.com/problems/quantity-overflow',
        code: 'QUANTITY_OVERFLOW',
      });
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      try {
        await createItemizedStatement('project-1', {
          name: '内訳書',
          quantityTableId: 'qt-overflow',
        });
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(422);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(
        createItemizedStatement('project-1', { name: '内訳書', quantityTableId: 'qt-1' })
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(
        createItemizedStatement('project-1', { name: '内訳書', quantityTableId: 'qt-1' })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // ==========================================================================
  // deleteItemizedStatement - 内訳書削除
  // ==========================================================================
  describe('deleteItemizedStatement', () => {
    it('内訳書を削除できること', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteItemizedStatement('is-1', '2025-01-02T00:00:00.000Z');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/itemized-statements/is-1', {
        body: { updatedAt: '2025-01-02T00:00:00.000Z' },
      });
    });

    it('存在しない内訳書を削除しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, '内訳書が見つかりません', {
        type: 'https://architrack.example.com/problems/itemized-statement-not-found',
        code: 'ITEMIZED_STATEMENT_NOT_FOUND',
      });
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      try {
        await deleteItemizedStatement('non-existent', '2025-01-01T00:00:00.000Z');
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
          type: 'https://architrack.example.com/problems/itemized-statement-conflict',
          code: 'ITEMIZED_STATEMENT_CONFLICT',
        }
      );
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      try {
        await deleteItemizedStatement('is-1', '2025-01-01T00:00:00.000Z');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(409);
      }
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(
        deleteItemizedStatement('is-1', '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      const mockError = new ApiError(403, 'アクセス権限がありません');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(
        deleteItemizedStatement('is-1', '2025-01-01T00:00:00.000Z')
      ).rejects.toMatchObject({ statusCode: 403 });
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
        await getItemizedStatementDetail('is-1');
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
        await getItemizedStatementDetail('is-1');
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
        await getItemizedStatements('project-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
        expect((error as ApiError).message).toBe('Request timeout');
      }
    });
  });
});
