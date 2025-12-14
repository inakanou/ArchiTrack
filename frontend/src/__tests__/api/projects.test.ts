/**
 * @fileoverview プロジェクト用APIクライアントのユニットテスト
 *
 * Task 5.2: プロジェクト用APIクライアントの実装
 * TDD: RED Phase - テストを最初に書く
 *
 * Requirements:
 * - 14.1: GET /api/projects プロジェクト一覧取得
 * - 14.2: GET /api/projects/:id プロジェクト詳細取得
 * - 14.3: POST /api/projects プロジェクト作成
 * - 14.4: PUT /api/projects/:id プロジェクト更新
 * - 14.5: DELETE /api/projects/:id プロジェクト削除
 * - 17.12: GET /api/users/assignable 担当者候補取得
 * - 18.1, 18.2, 18.3: エラーハンドリング（ネットワークエラー、サーバーエラー）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  transitionStatus,
  getStatusHistory,
  getAssignableUsers,
} from '../../api/projects';
import {
  isDuplicateProjectNameErrorResponse,
  type PaginatedProjects,
  type ProjectDetail,
  type ProjectInfo,
  type StatusHistoryResponse,
  type AssignableUser,
  type CreateProjectInput,
  type UpdateProjectInput,
  type ProjectFilter,
  type StatusChangeInput,
} from '../../types/project.types';

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

describe('projects API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getProjects - プロジェクト一覧取得
  // ==========================================================================
  describe('getProjects', () => {
    const mockPaginatedProjects: PaginatedProjects = {
      data: [
        {
          id: 'project-1',
          name: 'テストプロジェクト1',
          tradingPartnerId: 'partner-1',
          tradingPartner: { id: 'partner-1', name: 'テスト顧客1', nameKana: 'テストコキャク1' },
          salesPerson: { id: 'user-1', displayName: '営業太郎' },
          constructionPerson: { id: 'user-2', displayName: '工事花子' },
          status: 'PREPARING',
          statusLabel: '準備中',
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

    it('デフォルトパラメータでプロジェクト一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedProjects);

      const result = await getProjects();

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects', {
        headers: undefined,
      });
      expect(result).toEqual(mockPaginatedProjects);
    });

    it('ページネーションパラメータを指定してプロジェクト一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedProjects);

      const result = await getProjects({ page: 2, limit: 50 });

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects?page=2&limit=50', {
        headers: undefined,
      });
      expect(result).toEqual(mockPaginatedProjects);
    });

    it('検索キーワードを指定してプロジェクト一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedProjects);

      const filter: ProjectFilter = { search: 'テスト' };
      const result = await getProjects({ filter });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects?search=%E3%83%86%E3%82%B9%E3%83%88',
        {
          headers: undefined,
        }
      );
      expect(result).toEqual(mockPaginatedProjects);
    });

    it('ステータスフィルタを指定してプロジェクト一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedProjects);

      const filter: ProjectFilter = { status: ['PREPARING', 'SURVEYING'] };
      const result = await getProjects({ filter });

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects?status=PREPARING%2CSURVEYING', {
        headers: undefined,
      });
      expect(result).toEqual(mockPaginatedProjects);
    });

    it('期間フィルタを指定してプロジェクト一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedProjects);

      const filter: ProjectFilter = {
        createdFrom: '2025-01-01',
        createdTo: '2025-12-31',
      };
      const result = await getProjects({ filter });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects?createdFrom=2025-01-01&createdTo=2025-12-31',
        { headers: undefined }
      );
      expect(result).toEqual(mockPaginatedProjects);
    });

    it('ソートパラメータを指定してプロジェクト一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedProjects);

      const result = await getProjects({ sort: 'name', order: 'asc' });

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects?sort=name&order=asc', {
        headers: undefined,
      });
      expect(result).toEqual(mockPaginatedProjects);
    });

    it('すべてのパラメータを組み合わせてプロジェクト一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedProjects);

      const filter: ProjectFilter = {
        search: 'テスト',
        status: ['PREPARING'],
        createdFrom: '2025-01-01',
        createdTo: '2025-12-31',
      };
      const result = await getProjects({
        page: 1,
        limit: 20,
        filter,
        sort: 'updatedAt',
        order: 'desc',
      });

      expect(apiClient.get).toHaveBeenCalled();
      expect(result).toEqual(mockPaginatedProjects);
    });

    it('APIエラーが発生した場合、エラーがスローされること', async () => {
      const mockError = new ApiError(400, 'バリデーションエラー');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getProjects()).rejects.toThrow(ApiError);
    });

    it('ネットワークエラーが発生した場合、エラーがスローされること', async () => {
      const mockError = new ApiError(0, 'Network error');
      vi.mocked(apiClient.get).mockRejectedValue(mockError);

      try {
        await getProjects();
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
      }
    });
  });

  // ==========================================================================
  // getProject - プロジェクト詳細取得
  // ==========================================================================
  describe('getProject', () => {
    const mockProjectDetail: ProjectDetail = {
      id: 'project-1',
      name: 'テストプロジェクト1',
      tradingPartnerId: 'partner-1',
      tradingPartner: { id: 'partner-1', name: 'テスト顧客1', nameKana: 'テストコキャク1' },
      salesPerson: { id: 'user-1', displayName: '営業太郎' },
      constructionPerson: { id: 'user-2', displayName: '工事花子' },
      siteAddress: '東京都千代田区1-1-1',
      description: 'テストプロジェクトの説明',
      status: 'PREPARING',
      statusLabel: '準備中',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    };

    it('プロジェクトIDを指定してプロジェクト詳細を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockProjectDetail);

      const result = await getProject('project-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1');
      expect(result).toEqual(mockProjectDetail);
    });

    it('存在しないプロジェクトIDを指定した場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'プロジェクトが見つかりません');
      vi.mocked(apiClient.get).mockRejectedValue(mockError);

      try {
        await getProject('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });
  });

  // ==========================================================================
  // createProject - プロジェクト作成
  // ==========================================================================
  describe('createProject', () => {
    const mockProjectInfo: ProjectInfo = {
      id: 'project-new',
      name: '新規プロジェクト',
      tradingPartnerId: 'partner-new',
      tradingPartner: { id: 'partner-new', name: '新規顧客', nameKana: 'シンキコキャク' },
      salesPerson: { id: 'user-1', displayName: '営業太郎' },
      status: 'PREPARING',
      statusLabel: '準備中',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    it('プロジェクトを作成できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockProjectInfo);

      const input: CreateProjectInput = {
        name: '新規プロジェクト',
        tradingPartnerId: 'partner-new',
        salesPersonId: 'user-1',
      };
      const result = await createProject(input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/projects', input);
      expect(result).toEqual(mockProjectInfo);
    });

    it('すべてのフィールドを指定してプロジェクトを作成できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockProjectInfo);

      const input: CreateProjectInput = {
        name: '新規プロジェクト',
        tradingPartnerId: 'partner-new',
        salesPersonId: 'user-1',
        constructionPersonId: 'user-2',
        siteAddress: '東京都千代田区1-1-1',
        description: 'プロジェクトの説明',
      };
      const result = await createProject(input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/projects', input);
      expect(result).toEqual(mockProjectInfo);
    });

    it('バリデーションエラーが発生した場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, 'プロジェクト名は必須です');
      vi.mocked(apiClient.post).mockRejectedValue(mockError);

      const input: CreateProjectInput = {
        name: '',
        salesPersonId: 'user-1',
      };

      try {
        await createProject(input);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });
  });

  // ==========================================================================
  // updateProject - プロジェクト更新
  // ==========================================================================
  describe('updateProject', () => {
    const mockProjectInfo: ProjectInfo = {
      id: 'project-1',
      name: '更新されたプロジェクト',
      tradingPartnerId: 'partner-updated',
      tradingPartner: {
        id: 'partner-updated',
        name: '更新された顧客',
        nameKana: 'コウシンサレタコキャク',
      },
      salesPerson: { id: 'user-1', displayName: '営業太郎' },
      status: 'PREPARING',
      statusLabel: '準備中',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z',
    };

    it('プロジェクトを更新できること', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockProjectInfo);

      const input: UpdateProjectInput = {
        name: '更新されたプロジェクト',
      };
      const expectedUpdatedAt = '2025-01-02T00:00:00.000Z';
      const result = await updateProject('project-1', input, expectedUpdatedAt);

      expect(apiClient.put).toHaveBeenCalledWith('/api/projects/project-1', {
        ...input,
        expectedUpdatedAt,
      });
      expect(result).toEqual(mockProjectInfo);
    });

    it('複数のフィールドを更新できること', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockProjectInfo);

      const input: UpdateProjectInput = {
        name: '更新されたプロジェクト',
        tradingPartnerId: 'partner-updated',
        siteAddress: '新しい住所',
      };
      const expectedUpdatedAt = '2025-01-02T00:00:00.000Z';
      const result = await updateProject('project-1', input, expectedUpdatedAt);

      expect(apiClient.put).toHaveBeenCalledWith('/api/projects/project-1', {
        ...input,
        expectedUpdatedAt,
      });
      expect(result).toEqual(mockProjectInfo);
    });

    it('楽観的排他制御エラーが発生した場合、409エラーがスローされること', async () => {
      const mockError = new ApiError(409, 'プロジェクトは他のユーザーによって更新されました');
      vi.mocked(apiClient.put).mockRejectedValue(mockError);

      const input: UpdateProjectInput = { name: '更新' };
      const expectedUpdatedAt = '2025-01-01T00:00:00.000Z';

      try {
        await updateProject('project-1', input, expectedUpdatedAt);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(409);
      }
    });

    it('存在しないプロジェクトを更新しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'プロジェクトが見つかりません');
      vi.mocked(apiClient.put).mockRejectedValue(mockError);

      const input: UpdateProjectInput = { name: '更新' };
      const expectedUpdatedAt = '2025-01-01T00:00:00.000Z';

      try {
        await updateProject('non-existent', input, expectedUpdatedAt);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });
  });

  // ==========================================================================
  // deleteProject - プロジェクト削除
  // ==========================================================================
  describe('deleteProject', () => {
    it('プロジェクトを削除できること', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteProject('project-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/projects/project-1');
    });

    it('存在しないプロジェクトを削除しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'プロジェクトが見つかりません');
      vi.mocked(apiClient.delete).mockRejectedValue(mockError);

      try {
        await deleteProject('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });
  });

  // ==========================================================================
  // transitionStatus - ステータス変更
  // ==========================================================================
  describe('transitionStatus', () => {
    const mockProjectInfo: ProjectInfo = {
      id: 'project-1',
      name: 'テストプロジェクト',
      tradingPartnerId: 'partner-1',
      tradingPartner: { id: 'partner-1', name: 'テスト顧客', nameKana: 'テストコキャク' },
      salesPerson: { id: 'user-1', displayName: '営業太郎' },
      status: 'SURVEYING',
      statusLabel: '調査中',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z',
    };

    it('順方向遷移でステータスを変更できること', async () => {
      vi.mocked(apiClient.patch).mockResolvedValueOnce(mockProjectInfo);

      const input: StatusChangeInput = { status: 'SURVEYING' };
      const result = await transitionStatus('project-1', input);

      expect(apiClient.patch).toHaveBeenCalledWith('/api/projects/project-1/status', input);
      expect(result).toEqual(mockProjectInfo);
    });

    it('差し戻し遷移で理由を指定してステータスを変更できること', async () => {
      const projectWithBackwardStatus: ProjectInfo = {
        ...mockProjectInfo,
        status: 'PREPARING',
        statusLabel: '準備中',
      };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(projectWithBackwardStatus);

      const input: StatusChangeInput = {
        status: 'PREPARING',
        reason: '調査内容に問題があったため',
      };
      const result = await transitionStatus('project-1', input);

      expect(apiClient.patch).toHaveBeenCalledWith('/api/projects/project-1/status', input);
      expect(result).toEqual(projectWithBackwardStatus);
    });

    it('無効なステータス遷移の場合、422エラーがスローされること', async () => {
      const mockError = new ApiError(422, '無効なステータス遷移です');
      vi.mocked(apiClient.patch).mockRejectedValue(mockError);

      const input: StatusChangeInput = { status: 'COMPLETED' };

      try {
        await transitionStatus('project-1', input);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(422);
      }
    });

    it('差し戻し遷移で理由が未入力の場合、422エラーがスローされること', async () => {
      const mockError = new ApiError(422, '差し戻し理由は必須です');
      vi.mocked(apiClient.patch).mockRejectedValue(mockError);

      const input: StatusChangeInput = { status: 'PREPARING' };

      try {
        await transitionStatus('project-1', input);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(422);
      }
    });
  });

  // ==========================================================================
  // getStatusHistory - ステータス履歴取得
  // ==========================================================================
  describe('getStatusHistory', () => {
    const mockStatusHistory: StatusHistoryResponse[] = [
      {
        id: 'history-1',
        fromStatus: null,
        fromStatusLabel: null,
        toStatus: 'PREPARING',
        toStatusLabel: '準備中',
        transitionType: 'initial',
        transitionTypeLabel: '初期遷移',
        reason: null,
        changedBy: { id: 'user-1', displayName: '作成者' },
        changedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'history-2',
        fromStatus: 'PREPARING',
        fromStatusLabel: '準備中',
        toStatus: 'SURVEYING',
        toStatusLabel: '調査中',
        transitionType: 'forward',
        transitionTypeLabel: '順方向遷移',
        reason: null,
        changedBy: { id: 'user-1', displayName: '営業太郎' },
        changedAt: '2025-01-02T00:00:00.000Z',
      },
    ];

    it('プロジェクトのステータス変更履歴を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockStatusHistory);

      const result = await getStatusHistory('project-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1/status-history');
      expect(result).toEqual(mockStatusHistory);
    });

    it('存在しないプロジェクトの履歴を取得しようとした場合、404エラーがスローされること', async () => {
      const mockError = new ApiError(404, 'プロジェクトが見つかりません');
      vi.mocked(apiClient.get).mockRejectedValue(mockError);

      try {
        await getStatusHistory('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
      }
    });
  });

  // ==========================================================================
  // getAssignableUsers - 担当者候補取得
  // ==========================================================================
  describe('getAssignableUsers', () => {
    const mockAssignableUsers: AssignableUser[] = [
      { id: 'user-1', displayName: '営業太郎' },
      { id: 'user-2', displayName: '工事花子' },
      { id: 'user-3', displayName: '管理次郎' },
    ];

    it('担当者候補一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockAssignableUsers);

      const result = await getAssignableUsers();

      expect(apiClient.get).toHaveBeenCalledWith('/api/users/assignable');
      expect(result).toEqual(mockAssignableUsers);
    });

    it('担当者候補が0件の場合、空配列が返されること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce([]);

      const result = await getAssignableUsers();

      expect(apiClient.get).toHaveBeenCalledWith('/api/users/assignable');
      expect(result).toEqual([]);
    });

    it('認証エラーが発生した場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.get).mockRejectedValue(mockError);

      try {
        await getAssignableUsers();
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(401);
      }
    });
  });

  // ==========================================================================
  // 409エラーハンドリング（プロジェクト名重複）
  // Task 22.4: プロジェクトAPIクライアントに409エラーハンドリング追加
  // Requirements: 1.15, 8.7
  // ==========================================================================
  describe('プロジェクト名重複エラー（409）', () => {
    it('createProjectでプロジェクト名重複エラー（409）を識別できること', async () => {
      const duplicateErrorResponse = {
        type: 'https://architrack.example.com/problems/project-name-duplicate',
        title: 'Duplicate Project Name',
        status: 409,
        detail: 'このプロジェクト名は既に使用されています: 既存プロジェクト',
        code: 'PROJECT_NAME_DUPLICATE',
        projectName: '既存プロジェクト',
      };
      const mockError = new ApiError(409, duplicateErrorResponse.detail, duplicateErrorResponse);
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      const input: CreateProjectInput = {
        name: '既存プロジェクト',
        salesPersonId: 'user-1',
      };

      try {
        await createProject(input);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.statusCode).toBe(409);
        expect(apiError.message).toBe('このプロジェクト名は既に使用されています: 既存プロジェクト');
        expect(apiError.response).toBeDefined();
        // 型ガードを使用してresponseの内容を検証
        expect(isDuplicateProjectNameErrorResponse(apiError.response)).toBe(true);
        if (isDuplicateProjectNameErrorResponse(apiError.response)) {
          expect(apiError.response.code).toBe('PROJECT_NAME_DUPLICATE');
          expect(apiError.response.projectName).toBe('既存プロジェクト');
        }
      }
    });

    it('updateProjectでプロジェクト名重複エラー（409）を識別できること', async () => {
      const duplicateErrorResponse = {
        type: 'https://architrack.example.com/problems/project-name-duplicate',
        title: 'Duplicate Project Name',
        status: 409,
        detail: 'このプロジェクト名は既に使用されています: 別の既存プロジェクト',
        code: 'PROJECT_NAME_DUPLICATE',
        projectName: '別の既存プロジェクト',
      };
      const mockError = new ApiError(409, duplicateErrorResponse.detail, duplicateErrorResponse);
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      const input: UpdateProjectInput = {
        name: '別の既存プロジェクト',
      };
      const expectedUpdatedAt = '2025-01-02T00:00:00.000Z';

      try {
        await updateProject('project-1', input, expectedUpdatedAt);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.statusCode).toBe(409);
        expect(apiError.message).toBe(
          'このプロジェクト名は既に使用されています: 別の既存プロジェクト'
        );
        expect(apiError.response).toBeDefined();
        // 型ガードを使用してresponseの内容を検証
        expect(isDuplicateProjectNameErrorResponse(apiError.response)).toBe(true);
        if (isDuplicateProjectNameErrorResponse(apiError.response)) {
          expect(apiError.response.code).toBe('PROJECT_NAME_DUPLICATE');
          expect(apiError.response.projectName).toBe('別の既存プロジェクト');
        }
      }
    });

    it('updateProjectで409エラーが楽観的排他制御エラーかプロジェクト名重複エラーかを区別できること', async () => {
      // 楽観的排他制御エラー（競合エラー）
      const conflictErrorResponse = {
        type: 'https://architrack.example.com/problems/conflict',
        title: 'Conflict',
        status: 409,
        detail: 'プロジェクトは他のユーザーによって更新されました',
        code: 'CONFLICT',
      };
      const mockConflictError = new ApiError(
        409,
        conflictErrorResponse.detail,
        conflictErrorResponse
      );
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockConflictError);

      const input: UpdateProjectInput = { name: '更新' };
      const expectedUpdatedAt = '2025-01-01T00:00:00.000Z';

      try {
        await updateProject('project-1', input, expectedUpdatedAt);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.statusCode).toBe(409);
        // プロジェクト名重複エラーではない
        expect(isDuplicateProjectNameErrorResponse(apiError.response)).toBe(false);
      }
    });
  });

  // ==========================================================================
  // エラーハンドリング（18.1, 18.2, 18.3）
  // ==========================================================================
  describe('エラーハンドリング', () => {
    it('ネットワークエラーの場合、statusCode 0のApiErrorがスローされること', async () => {
      const mockError = new ApiError(0, 'Network error');
      vi.mocked(apiClient.get).mockRejectedValue(mockError);

      try {
        await getProjects();
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
        expect((error as ApiError).message).toBe('Network error');
      }
    });

    it('サーバーエラー（5xx）の場合、適切なApiErrorがスローされること', async () => {
      const mockError = new ApiError(500, 'Internal Server Error');
      vi.mocked(apiClient.get).mockRejectedValue(mockError);

      try {
        await getProjects();
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
      }
    });

    it('タイムアウトエラーの場合、statusCode 0のApiErrorがスローされること', async () => {
      const mockError = new ApiError(0, 'Request timeout');
      vi.mocked(apiClient.get).mockRejectedValue(mockError);

      try {
        await getProjects();
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
        expect((error as ApiError).message).toBe('Request timeout');
      }
    });
  });
});
