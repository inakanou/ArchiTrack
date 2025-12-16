/**
 * @fileoverview 現場調査APIクライアントのユニットテスト
 *
 * Task 7.1: 現場調査APIクライアントの実装
 * TDD: RED Phase - テストを最初に書く
 *
 * Requirements:
 * - 1.1: POST /api/projects/:projectId/site-surveys 現場調査作成
 * - 1.2: GET /api/site-surveys/:id 現場調査詳細取得
 * - 1.3: PUT /api/site-surveys/:id 現場調査更新（楽観的排他制御）
 * - 1.4: DELETE /api/site-surveys/:id 現場調査削除
 * - 3.1: GET /api/projects/:projectId/site-surveys 現場調査一覧取得（ページネーション）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getSiteSurveys,
  getSiteSurvey,
  createSiteSurvey,
  updateSiteSurvey,
  deleteSiteSurvey,
} from '../../api/site-surveys';
import {
  isSiteSurveyConflictErrorResponse,
  isProjectNotFoundForSurveyErrorResponse,
  isSiteSurveyNotFoundErrorResponse,
  type PaginatedSiteSurveys,
  type SiteSurveyDetail,
  type SiteSurveyInfo,
  type CreateSiteSurveyInput,
  type UpdateSiteSurveyInput,
  type SiteSurveyFilter,
} from '../../types/site-survey.types';

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

describe('site-surveys API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getSiteSurveys - 現場調査一覧取得
  // Requirements: 3.1, 3.2, 3.3, 3.4
  // ==========================================================================
  describe('getSiteSurveys', () => {
    const mockPaginatedSiteSurveys: PaginatedSiteSurveys = {
      data: [
        {
          id: 'survey-1',
          projectId: 'project-1',
          name: '現場調査1',
          surveyDate: '2025-01-15',
          memo: 'メモ1',
          thumbnailUrl: '/uploads/thumbnails/image1.jpg',
          imageCount: 3,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
        {
          id: 'survey-2',
          projectId: 'project-1',
          name: '現場調査2',
          surveyDate: '2025-01-20',
          memo: null,
          thumbnailUrl: null,
          imageCount: 0,
          createdAt: '2025-01-03T00:00:00.000Z',
          updatedAt: '2025-01-03T00:00:00.000Z',
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      },
    };

    it('デフォルトパラメータで現場調査一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedSiteSurveys);

      const result = await getSiteSurveys('project-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1/site-surveys');
      expect(result).toEqual(mockPaginatedSiteSurveys);
    });

    it('ページネーションパラメータを指定して現場調査一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedSiteSurveys);

      const result = await getSiteSurveys('project-1', { page: 2, limit: 50 });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/site-surveys?page=2&limit=50'
      );
      expect(result).toEqual(mockPaginatedSiteSurveys);
    });

    it('検索キーワードを指定して現場調査一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedSiteSurveys);

      const filter: SiteSurveyFilter = { search: '調査' };
      const result = await getSiteSurveys('project-1', { filter });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/site-surveys?search=%E8%AA%BF%E6%9F%BB'
      );
      expect(result).toEqual(mockPaginatedSiteSurveys);
    });

    it('調査日フィルタを指定して現場調査一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedSiteSurveys);

      const filter: SiteSurveyFilter = {
        surveyDateFrom: '2025-01-01',
        surveyDateTo: '2025-12-31',
      };
      const result = await getSiteSurveys('project-1', { filter });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/site-surveys?surveyDateFrom=2025-01-01&surveyDateTo=2025-12-31'
      );
      expect(result).toEqual(mockPaginatedSiteSurveys);
    });

    it('ソートパラメータを指定して現場調査一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedSiteSurveys);

      const result = await getSiteSurveys('project-1', { sort: 'surveyDate', order: 'desc' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/site-surveys?sort=surveyDate&order=desc'
      );
      expect(result).toEqual(mockPaginatedSiteSurveys);
    });

    it('すべてのパラメータを組み合わせて現場調査一覧を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedSiteSurveys);

      const filter: SiteSurveyFilter = {
        search: '調査',
        surveyDateFrom: '2025-01-01',
        surveyDateTo: '2025-12-31',
      };
      const result = await getSiteSurveys('project-1', {
        page: 1,
        limit: 20,
        filter,
        sort: 'surveyDate',
        order: 'desc',
      });

      expect(apiClient.get).toHaveBeenCalled();
      expect(result).toEqual(mockPaginatedSiteSurveys);
    });

    it('APIエラーが発生した場合、エラーがスローされること', async () => {
      const mockError = new ApiError(400, 'バリデーションエラー');
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getSiteSurveys('project-1')).rejects.toThrow(ApiError);
    });

    it('認証エラーが発生した場合、401エラーがスローされること', async () => {
      const mockError = new ApiError(401, '認証が必要です');
      vi.mocked(apiClient.get).mockRejectedValue(mockError);

      try {
        await getSiteSurveys('project-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(401);
      }
    });
  });

  // ==========================================================================
  // getSiteSurvey - 現場調査詳細取得
  // Requirements: 1.2
  // ==========================================================================
  describe('getSiteSurvey', () => {
    const mockSiteSurveyDetail: SiteSurveyDetail = {
      id: 'survey-1',
      projectId: 'project-1',
      name: '現場調査1',
      surveyDate: '2025-01-15',
      memo: 'メモ1',
      thumbnailUrl: '/uploads/thumbnails/image1.jpg',
      imageCount: 3,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
      project: {
        id: 'project-1',
        name: 'テストプロジェクト',
      },
      images: [
        {
          id: 'image-1',
          surveyId: 'survey-1',
          originalPath: '/uploads/originals/image1.jpg',
          thumbnailPath: '/uploads/thumbnails/image1.jpg',
          fileName: 'image1.jpg',
          fileSize: 1024000,
          width: 1920,
          height: 1080,
          displayOrder: 1,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ],
    };

    it('現場調査IDを指定して現場調査詳細を取得できること', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSiteSurveyDetail);

      const result = await getSiteSurvey('survey-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/site-surveys/survey-1');
      expect(result).toEqual(mockSiteSurveyDetail);
    });

    it('存在しない現場調査IDを指定した場合、404エラーがスローされること', async () => {
      const mockErrorResponse = {
        type: 'https://architrack.example.com/problems/site-survey-not-found',
        title: 'Site Survey Not Found',
        status: 404,
        detail: 'Site survey not found: non-existent',
        code: 'SITE_SURVEY_NOT_FOUND',
        surveyId: 'non-existent',
      };
      const mockError = new ApiError(404, mockErrorResponse.detail, mockErrorResponse);
      vi.mocked(apiClient.get).mockRejectedValue(mockError);

      try {
        await getSiteSurvey('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
        expect(isSiteSurveyNotFoundErrorResponse((error as ApiError).response)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // createSiteSurvey - 現場調査作成
  // Requirements: 1.1, 1.6
  // ==========================================================================
  describe('createSiteSurvey', () => {
    const mockSiteSurveyInfo: SiteSurveyInfo = {
      id: 'survey-new',
      projectId: 'project-1',
      name: '新規調査',
      surveyDate: '2025-01-20',
      memo: 'テストメモ',
      thumbnailUrl: null,
      imageCount: 0,
      createdAt: '2025-01-15T00:00:00.000Z',
      updatedAt: '2025-01-15T00:00:00.000Z',
    };

    it('現場調査を作成できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockSiteSurveyInfo);

      const input: CreateSiteSurveyInput = {
        name: '新規調査',
        surveyDate: '2025-01-20',
      };
      const result = await createSiteSurvey('project-1', input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/projects/project-1/site-surveys', input);
      expect(result).toEqual(mockSiteSurveyInfo);
    });

    it('メモ付きで現場調査を作成できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockSiteSurveyInfo);

      const input: CreateSiteSurveyInput = {
        name: '新規調査',
        surveyDate: '2025-01-20',
        memo: 'テストメモ',
      };
      const result = await createSiteSurvey('project-1', input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/projects/project-1/site-surveys', input);
      expect(result).toEqual(mockSiteSurveyInfo);
    });

    it('プロジェクトが存在しない場合、404エラーがスローされること', async () => {
      const mockErrorResponse = {
        type: 'https://architrack.example.com/problems/project-not-found',
        title: 'Project Not Found',
        status: 404,
        detail: 'プロジェクトが見つかりません: non-existent-project',
        code: 'PROJECT_NOT_FOUND',
        projectId: 'non-existent-project',
      };
      const mockError = new ApiError(404, mockErrorResponse.detail, mockErrorResponse);
      vi.mocked(apiClient.post).mockRejectedValue(mockError);

      const input: CreateSiteSurveyInput = {
        name: '新規調査',
        surveyDate: '2025-01-20',
      };

      try {
        await createSiteSurvey('non-existent-project', input);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.statusCode).toBe(404);
        expect(isProjectNotFoundForSurveyErrorResponse(apiError.response)).toBe(true);
        if (isProjectNotFoundForSurveyErrorResponse(apiError.response)) {
          expect(apiError.response.projectId).toBe('non-existent-project');
        }
      }
    });

    it('バリデーションエラーが発生した場合、400エラーがスローされること', async () => {
      const mockError = new ApiError(400, '現場調査名は必須です');
      vi.mocked(apiClient.post).mockRejectedValue(mockError);

      const input: CreateSiteSurveyInput = {
        name: '',
        surveyDate: '2025-01-20',
      };

      try {
        await createSiteSurvey('project-1', input);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });
  });

  // ==========================================================================
  // updateSiteSurvey - 現場調査更新
  // Requirements: 1.3, 1.5
  // ==========================================================================
  describe('updateSiteSurvey', () => {
    const mockSiteSurveyInfo: SiteSurveyInfo = {
      id: 'survey-1',
      projectId: 'project-1',
      name: '更新された調査',
      surveyDate: '2025-01-25',
      memo: '更新メモ',
      thumbnailUrl: '/uploads/thumbnails/image1.jpg',
      imageCount: 3,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-20T00:00:00.000Z',
    };

    it('現場調査を更新できること', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockSiteSurveyInfo);

      const input: UpdateSiteSurveyInput = {
        name: '更新された調査',
      };
      const expectedUpdatedAt = '2025-01-02T00:00:00.000Z';
      const result = await updateSiteSurvey('survey-1', input, expectedUpdatedAt);

      expect(apiClient.put).toHaveBeenCalledWith('/api/site-surveys/survey-1', {
        ...input,
        expectedUpdatedAt,
      });
      expect(result).toEqual(mockSiteSurveyInfo);
    });

    it('複数のフィールドを更新できること', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockSiteSurveyInfo);

      const input: UpdateSiteSurveyInput = {
        name: '更新された調査',
        surveyDate: '2025-01-25',
        memo: '更新メモ',
      };
      const expectedUpdatedAt = '2025-01-02T00:00:00.000Z';
      const result = await updateSiteSurvey('survey-1', input, expectedUpdatedAt);

      expect(apiClient.put).toHaveBeenCalledWith('/api/site-surveys/survey-1', {
        ...input,
        expectedUpdatedAt,
      });
      expect(result).toEqual(mockSiteSurveyInfo);
    });

    it('楽観的排他制御エラーが発生した場合、409エラーがスローされること', async () => {
      const mockErrorResponse = {
        type: 'https://architrack.example.com/problems/site-survey-conflict',
        title: 'Conflict',
        status: 409,
        detail: '現場調査は他のユーザーによって更新されました。最新データを確認してください。',
        code: 'SITE_SURVEY_CONFLICT',
        expectedUpdatedAt: '2025-01-02T00:00:00.000Z',
        actualUpdatedAt: '2025-01-03T00:00:00.000Z',
      };
      const mockError = new ApiError(409, mockErrorResponse.detail, mockErrorResponse);
      vi.mocked(apiClient.put).mockRejectedValue(mockError);

      const input: UpdateSiteSurveyInput = { name: '更新' };
      const expectedUpdatedAt = '2025-01-02T00:00:00.000Z';

      try {
        await updateSiteSurvey('survey-1', input, expectedUpdatedAt);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.statusCode).toBe(409);
        expect(isSiteSurveyConflictErrorResponse(apiError.response)).toBe(true);
        if (isSiteSurveyConflictErrorResponse(apiError.response)) {
          expect(apiError.response.code).toBe('SITE_SURVEY_CONFLICT');
        }
      }
    });

    it('存在しない現場調査を更新しようとした場合、404エラーがスローされること', async () => {
      const mockErrorResponse = {
        type: 'https://architrack.example.com/problems/site-survey-not-found',
        title: 'Site Survey Not Found',
        status: 404,
        detail: 'Site survey not found: non-existent',
        code: 'SITE_SURVEY_NOT_FOUND',
      };
      const mockError = new ApiError(404, mockErrorResponse.detail, mockErrorResponse);
      vi.mocked(apiClient.put).mockRejectedValue(mockError);

      const input: UpdateSiteSurveyInput = { name: '更新' };
      const expectedUpdatedAt = '2025-01-02T00:00:00.000Z';

      try {
        await updateSiteSurvey('non-existent', input, expectedUpdatedAt);
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
        expect(isSiteSurveyNotFoundErrorResponse((error as ApiError).response)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // deleteSiteSurvey - 現場調査削除
  // Requirements: 1.4
  // ==========================================================================
  describe('deleteSiteSurvey', () => {
    it('現場調査を削除できること', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteSiteSurvey('survey-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/site-surveys/survey-1');
    });

    it('存在しない現場調査を削除しようとした場合、404エラーがスローされること', async () => {
      const mockErrorResponse = {
        type: 'https://architrack.example.com/problems/site-survey-not-found',
        title: 'Site Survey Not Found',
        status: 404,
        detail: 'Site survey not found: non-existent',
        code: 'SITE_SURVEY_NOT_FOUND',
      };
      const mockError = new ApiError(404, mockErrorResponse.detail, mockErrorResponse);
      vi.mocked(apiClient.delete).mockRejectedValue(mockError);

      try {
        await deleteSiteSurvey('non-existent');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(404);
        expect(isSiteSurveyNotFoundErrorResponse((error as ApiError).response)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // エラーハンドリング
  // ==========================================================================
  describe('エラーハンドリング', () => {
    it('ネットワークエラーの場合、statusCode 0のApiErrorがスローされること', async () => {
      const mockError = new ApiError(0, 'Network error');
      vi.mocked(apiClient.get).mockRejectedValue(mockError);

      try {
        await getSiteSurveys('project-1');
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
        await getSiteSurveys('project-1');
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
        await getSiteSurveys('project-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
        expect((error as ApiError).message).toBe('Request timeout');
      }
    });
  });

  // ==========================================================================
  // タイプガード関数のテスト
  // ==========================================================================
  describe('タイプガード関数', () => {
    describe('isSiteSurveyConflictErrorResponse', () => {
      it('正しい形式のオブジェクトに対してtrueを返すこと', () => {
        const response = {
          type: 'https://architrack.example.com/problems/site-survey-conflict',
          title: 'Conflict',
          status: 409,
          detail: '競合が発生しました',
          code: 'SITE_SURVEY_CONFLICT',
        };
        expect(isSiteSurveyConflictErrorResponse(response)).toBe(true);
      });

      it('不正な形式のオブジェクトに対してfalseを返すこと', () => {
        const response = {
          type: 'https://example.com/other-error',
          title: 'Other Error',
          status: 409,
          detail: 'その他のエラー',
          code: 'OTHER_ERROR',
        };
        expect(isSiteSurveyConflictErrorResponse(response)).toBe(false);
      });

      it('nullに対してfalseを返すこと', () => {
        expect(isSiteSurveyConflictErrorResponse(null)).toBe(false);
      });

      it('undefinedに対してfalseを返すこと', () => {
        expect(isSiteSurveyConflictErrorResponse(undefined)).toBe(false);
      });
    });

    describe('isProjectNotFoundForSurveyErrorResponse', () => {
      it('正しい形式のオブジェクトに対してtrueを返すこと', () => {
        const response = {
          type: 'https://architrack.example.com/problems/project-not-found',
          title: 'Project Not Found',
          status: 404,
          detail: 'プロジェクトが見つかりません',
          code: 'PROJECT_NOT_FOUND',
          projectId: 'project-123',
        };
        expect(isProjectNotFoundForSurveyErrorResponse(response)).toBe(true);
      });

      it('projectIdがない場合falseを返すこと', () => {
        const response = {
          type: 'https://architrack.example.com/problems/project-not-found',
          title: 'Project Not Found',
          status: 404,
          detail: 'プロジェクトが見つかりません',
          code: 'PROJECT_NOT_FOUND',
        };
        expect(isProjectNotFoundForSurveyErrorResponse(response)).toBe(false);
      });
    });

    describe('isSiteSurveyNotFoundErrorResponse', () => {
      it('正しい形式のオブジェクトに対してtrueを返すこと', () => {
        const response = {
          type: 'https://architrack.example.com/problems/site-survey-not-found',
          title: 'Site Survey Not Found',
          status: 404,
          detail: '現場調査が見つかりません',
          code: 'SITE_SURVEY_NOT_FOUND',
        };
        expect(isSiteSurveyNotFoundErrorResponse(response)).toBe(true);
      });

      it('codeが異なる場合falseを返すこと', () => {
        const response = {
          type: 'https://architrack.example.com/problems/not-found',
          title: 'Not Found',
          status: 404,
          detail: '見つかりません',
          code: 'NOT_FOUND',
        };
        expect(isSiteSurveyNotFoundErrorResponse(response)).toBe(false);
      });
    });
  });
});
