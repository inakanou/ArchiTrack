/**
 * @fileoverview 現場調査CRUDエンドポイントのテスト
 *
 * Requirements:
 * - 1.1: プロジェクトに紐付く新規現場調査レコードを作成する
 * - 1.2: 現場調査の基本情報と関連する画像一覧を表示する
 * - 1.3: 楽観的排他制御を用いて現場調査レコードを更新する
 * - 1.4: 現場調査と関連する画像データを論理削除する
 * - 3.1: プロジェクト単位でのページネーション
 *
 * TDD: RED phase - テストを先に作成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

// モックサービスをvi.hoisted()で初期化
const mockSiteSurveyService = vi.hoisted(() => ({
  createSiteSurvey: vi.fn(),
  findById: vi.fn(),
  findByProjectId: vi.fn(),
  updateSiteSurvey: vi.fn(),
  deleteSiteSurvey: vi.fn(),
}));

const mockAuditLogService = vi.hoisted(() => ({
  createLog: vi.fn().mockResolvedValue(undefined),
}));

const mockImageListService = vi.hoisted(() => ({
  findBySurveyIdWithUrls: vi.fn().mockResolvedValue([]),
}));

const mockSignedUrlService = vi.hoisted(() => ({
  generateSignedUrl: vi.fn().mockResolvedValue('https://example.com/signed-url'),
  getSignedUrlWithValidation: vi
    .fn()
    .mockResolvedValue({ success: true, url: 'https://example.com/signed-url' }),
}));

// モック: データベースとRedis
vi.mock('../../../db', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../redis', () => ({
  default: {
    getClient: vi.fn(() => null),
  },
}));

// モック: サービス層
vi.mock('../../../services/site-survey.service', () => ({
  SiteSurveyService: class {
    constructor() {
      return mockSiteSurveyService;
    }
  },
}));

vi.mock('../../../services/audit-log.service', () => ({
  AuditLogService: class {
    constructor() {
      return mockAuditLogService;
    }
  },
}));

vi.mock('../../../services/image-list.service', () => ({
  ImageListService: class {
    constructor() {
      return mockImageListService;
    }
  },
}));

vi.mock('../../../services/signed-url.service', () => ({
  SignedUrlService: class {
    constructor() {
      return mockSignedUrlService;
    }
  },
}));

// モック: 認証ミドルウェア
vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      userId: 'test-user-id',
      email: 'test@example.com',
      roles: ['user'],
    };
    next();
  },
}));

// モック: 認可ミドルウェア
vi.mock('../../../middleware/authorize.middleware', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// エラークラスをモック
vi.mock('../../../errors/siteSurveyError', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../errors/siteSurveyError.js')>();
  return {
    ...actual,
  };
});

// 実際のルートとミドルウェアをインポート（モックの後にインポート）
import siteSurveysRouter from '../../../routes/site-surveys.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';
import {
  SiteSurveyNotFoundError,
  SiteSurveyConflictError,
  ProjectNotFoundForSurveyError,
} from '../../../errors/siteSurveyError.js';

describe('Site Surveys Routes', () => {
  let app: Application;

  // テスト用UUID定数
  const TEST_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const TEST_SURVEY_ID = '550e8400-e29b-41d4-a716-446655440001';

  const mockSurveyInfo = {
    id: TEST_SURVEY_ID,
    projectId: TEST_PROJECT_ID,
    name: 'テスト現場調査',
    surveyDate: new Date('2025-01-15'),
    memo: 'テストメモ',
    thumbnailUrl: null,
    imageCount: 0,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
  };

  const mockSurveyDetail = {
    ...mockSurveyInfo,
    project: { id: TEST_PROJECT_ID, name: 'テストプロジェクト' },
    images: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    // ネストルートをマウント
    app.use('/api/projects/:projectId/site-surveys', siteSurveysRouter);
    app.use('/api/site-surveys', siteSurveysRouter);
    app.use(errorHandler);
  });

  describe('POST /api/projects/:projectId/site-surveys', () => {
    const validCreateInput = {
      name: '新規現場調査',
      surveyDate: '2025-01-15',
      memo: '調査メモ',
    };

    it('should create site survey successfully', async () => {
      const createdSurvey = {
        ...mockSurveyInfo,
        name: validCreateInput.name,
      };

      (mockSiteSurveyService.createSiteSurvey as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdSurvey
      );

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(validCreateInput);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: TEST_SURVEY_ID,
        name: '新規現場調査',
        projectId: TEST_PROJECT_ID,
      });
      expect(mockSiteSurveyService.createSiteSurvey).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: TEST_PROJECT_ID,
          name: validCreateInput.name,
          surveyDate: validCreateInput.surveyDate,
        }),
        'test-user-id'
      );
    });

    it('should create site survey with minimal required fields', async () => {
      const minimalInput = {
        name: '最小現場調査',
        surveyDate: '2025-01-15',
      };

      const createdSurvey = {
        ...mockSurveyInfo,
        name: minimalInput.name,
        memo: null,
      };

      (mockSiteSurveyService.createSiteSurvey as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdSurvey
      );

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(minimalInput);

      expect(response.status).toBe(201);
    });

    it('should return 400 when name is missing', async () => {
      const invalidInput = {
        surveyDate: '2025-01-15',
      };

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when surveyDate is missing', async () => {
      const invalidInput = {
        name: '現場調査名',
      };

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when name exceeds 200 characters', async () => {
      const invalidInput = {
        name: 'a'.repeat(201),
        surveyDate: '2025-01-15',
      };

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when memo exceeds 2000 characters', async () => {
      const invalidInput = {
        name: '現場調査名',
        surveyDate: '2025-01-15',
        memo: 'a'.repeat(2001),
      };

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when surveyDate is invalid format', async () => {
      const invalidInput = {
        name: '現場調査名',
        surveyDate: 'invalid-date',
      };

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when projectId is invalid UUID format', async () => {
      const response = await request(app)
        .post('/api/projects/invalid-uuid/site-surveys')
        .send(validCreateInput);

      expect(response.status).toBe(400);
    });

    it('should return 404 when project not found', async () => {
      (mockSiteSurveyService.createSiteSurvey as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ProjectNotFoundForSurveyError(TEST_PROJECT_ID)
      );

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(validCreateInput);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/projects/:projectId/site-surveys', () => {
    it('should return paginated site survey list with default parameters', async () => {
      const mockResult = {
        data: [mockSurveyInfo],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/site-surveys`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: TEST_SURVEY_ID,
        name: 'テスト現場調査',
        projectId: TEST_PROJECT_ID,
      });
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should support custom pagination parameters', async () => {
      const mockResult = {
        data: [],
        pagination: {
          page: 2,
          limit: 50,
          total: 100,
          totalPages: 2,
        },
      };

      (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app).get(
        `/api/projects/${TEST_PROJECT_ID}/site-surveys?page=2&limit=50`
      );

      expect(response.status).toBe(200);
      expect(mockSiteSurveyService.findByProjectId).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        expect.any(Object),
        expect.objectContaining({ page: 2, limit: 50 }),
        expect.any(Object)
      );
    });

    it('should support search parameter', async () => {
      const mockResult = {
        data: [mockSurveyInfo],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };

      (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app).get(
        `/api/projects/${TEST_PROJECT_ID}/site-surveys?search=テスト`
      );

      expect(response.status).toBe(200);
      expect(mockSiteSurveyService.findByProjectId).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        expect.objectContaining({ search: 'テスト' }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should support date range filter', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };

      (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app).get(
        `/api/projects/${TEST_PROJECT_ID}/site-surveys?surveyDateFrom=2025-01-01&surveyDateTo=2025-12-31`
      );

      expect(response.status).toBe(200);
      expect(mockSiteSurveyService.findByProjectId).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        expect.objectContaining({
          surveyDateFrom: '2025-01-01',
          surveyDateTo: '2025-12-31',
        }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should support sorting parameters', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };

      (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app).get(
        `/api/projects/${TEST_PROJECT_ID}/site-surveys?sort=surveyDate&order=asc`
      );

      expect(response.status).toBe(200);
      expect(mockSiteSurveyService.findByProjectId).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({ sort: 'surveyDate', order: 'asc' })
      );
    });

    it('should return 400 for invalid page parameter', async () => {
      const response = await request(app).get(
        `/api/projects/${TEST_PROJECT_ID}/site-surveys?page=0`
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid limit parameter', async () => {
      const response = await request(app).get(
        `/api/projects/${TEST_PROJECT_ID}/site-surveys?limit=101`
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid projectId format', async () => {
      const response = await request(app).get('/api/projects/invalid-uuid/site-surveys');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/site-surveys/:id', () => {
    it('should return site survey detail by id', async () => {
      (mockSiteSurveyService.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSurveyDetail
      );

      const response = await request(app).get(`/api/site-surveys/${TEST_SURVEY_ID}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: TEST_SURVEY_ID,
        name: 'テスト現場調査',
        project: { id: TEST_PROJECT_ID, name: 'テストプロジェクト' },
        images: [],
      });
    });

    it('should return 400 for invalid survey id format', async () => {
      const response = await request(app).get('/api/site-surveys/invalid-format');

      expect(response.status).toBe(400);
    });

    it('should return 404 when site survey not found', async () => {
      (mockSiteSurveyService.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const response = await request(app).get(`/api/site-surveys/${TEST_SURVEY_ID}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/site-surveys/:id', () => {
    const validUpdateInput = {
      name: '更新現場調査',
      expectedUpdatedAt: '2025-01-02T00:00:00.000Z',
    };

    it('should update site survey successfully', async () => {
      const updatedSurvey = {
        ...mockSurveyInfo,
        name: validUpdateInput.name,
      };

      (mockSiteSurveyService.updateSiteSurvey as ReturnType<typeof vi.fn>).mockResolvedValue(
        updatedSurvey
      );

      const response = await request(app)
        .put(`/api/site-surveys/${TEST_SURVEY_ID}`)
        .send(validUpdateInput);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: '更新現場調査',
      });
      expect(mockSiteSurveyService.updateSiteSurvey).toHaveBeenCalledWith(
        TEST_SURVEY_ID,
        expect.objectContaining({
          name: validUpdateInput.name,
        }),
        'test-user-id',
        expect.any(Date)
      );
    });

    it('should update site survey with partial fields', async () => {
      const partialInput = {
        memo: '新しいメモ',
        expectedUpdatedAt: '2025-01-02T00:00:00.000Z',
      };

      const updatedSurvey = {
        ...mockSurveyInfo,
        memo: partialInput.memo,
      };

      (mockSiteSurveyService.updateSiteSurvey as ReturnType<typeof vi.fn>).mockResolvedValue(
        updatedSurvey
      );

      const response = await request(app)
        .put(`/api/site-surveys/${TEST_SURVEY_ID}`)
        .send(partialInput);

      expect(response.status).toBe(200);
    });

    it('should return 400 for invalid survey id format', async () => {
      const response = await request(app)
        .put('/api/site-surveys/invalid-id')
        .send(validUpdateInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when expectedUpdatedAt is missing', async () => {
      const invalidInput = {
        name: '更新現場調査',
      };

      const response = await request(app)
        .put(`/api/site-surveys/${TEST_SURVEY_ID}`)
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 404 when site survey not found', async () => {
      (mockSiteSurveyService.updateSiteSurvey as ReturnType<typeof vi.fn>).mockRejectedValue(
        new SiteSurveyNotFoundError(TEST_SURVEY_ID)
      );

      const response = await request(app)
        .put(`/api/site-surveys/${TEST_SURVEY_ID}`)
        .send(validUpdateInput);

      expect(response.status).toBe(404);
    });

    it('should return 409 when conflict error (optimistic locking)', async () => {
      (mockSiteSurveyService.updateSiteSurvey as ReturnType<typeof vi.fn>).mockRejectedValue(
        new SiteSurveyConflictError('現場調査は他のユーザーによって更新されました', {
          expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
          actualUpdatedAt: '2025-01-02T00:00:00.000Z',
        })
      );

      const response = await request(app)
        .put(`/api/site-surveys/${TEST_SURVEY_ID}`)
        .send(validUpdateInput);

      expect(response.status).toBe(409);
    });
  });

  describe('DELETE /api/site-surveys/:id', () => {
    it('should delete site survey successfully', async () => {
      (mockSiteSurveyService.deleteSiteSurvey as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined
      );

      const response = await request(app).delete(`/api/site-surveys/${TEST_SURVEY_ID}`);

      expect(response.status).toBe(204);
      expect(mockSiteSurveyService.deleteSiteSurvey).toHaveBeenCalledWith(
        TEST_SURVEY_ID,
        'test-user-id'
      );
    });

    it('should return 400 for invalid survey id format', async () => {
      const response = await request(app).delete('/api/site-surveys/invalid-id');

      expect(response.status).toBe(400);
    });

    it('should return 404 when site survey not found', async () => {
      (mockSiteSurveyService.deleteSiteSurvey as ReturnType<typeof vi.fn>).mockRejectedValue(
        new SiteSurveyNotFoundError(TEST_SURVEY_ID)
      );

      const response = await request(app).delete(`/api/site-surveys/${TEST_SURVEY_ID}`);

      expect(response.status).toBe(404);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for POST /api/projects/:projectId/site-surveys', async () => {
      const validInput = {
        name: '現場調査',
        surveyDate: '2025-01-15',
      };

      (mockSiteSurveyService.createSiteSurvey as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSurveyInfo
      );

      const response = await request(app)
        .post(`/api/projects/${TEST_PROJECT_ID}/site-surveys`)
        .send(validInput);

      expect(response.status).toBe(201);
      expect(mockSiteSurveyService.createSiteSurvey).toHaveBeenCalledWith(
        expect.any(Object),
        'test-user-id'
      );
    });

    it('should require authentication for GET /api/projects/:projectId/site-surveys', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
      (mockSiteSurveyService.findByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/site-surveys`);

      expect(response.status).toBe(200);
    });
  });
});
