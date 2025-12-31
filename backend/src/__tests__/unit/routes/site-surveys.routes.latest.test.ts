/**
 * @fileoverview 現場調査直近N件取得APIエンドポイントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 2.1: プロジェクト詳細画面に直近2件の現場調査と総数を表示する
 *
 * Task 31.1: 現場調査直近N件取得APIエンドポイントを実装する
 * - GET /api/projects/:projectId/site-surveys/latest
 * - クエリパラメータでlimit（デフォルト2）を指定可能
 * - 直近N件の現場調査と総数（totalCount）を返却する
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';

// モックの設定
vi.mock('../../../services/site-survey.service.js', () => ({
  SiteSurveyService: vi.fn().mockImplementation(() => ({
    findLatestByProjectId: vi.fn(),
  })),
}));

vi.mock('../../../services/audit-log.service.js', () => ({
  AuditLogService: vi.fn().mockImplementation(() => ({
    createLog: vi.fn(),
  })),
}));

vi.mock('../../../db.js', () => ({
  default: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../storage/index.js', () => ({
  isStorageConfigured: vi.fn().mockReturnValue(false),
  getStorageProvider: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../services/image-list.service.js', () => ({
  ImageListService: vi.fn().mockImplementation(() => ({
    findBySurveyIdWithUrls: vi.fn(),
  })),
}));

vi.mock('../../../services/signed-url.service.js', () => ({
  SignedUrlService: vi.fn().mockImplementation(() => ({})),
}));

// 認証・認可ミドルウェアのモック
vi.mock('../../../middleware/authenticate.middleware.js', () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => {
    _req.user = { userId: 'test-user-id', email: 'test@example.com', roles: ['admin'] };
    next();
  },
}));

vi.mock('../../../middleware/authorize.middleware.js', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => {
    next();
  },
}));

describe('GET /api/projects/:projectId/site-surveys/latest', () => {
  let app: Express;
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    // 動的インポート
    const { default: siteSurveysRouter } = await import('../../../routes/site-surveys.routes.js');

    app = express();
    app.use(express.json());
    app.use('/api/projects/:projectId/site-surveys', siteSurveysRouter);

    request = supertest(app);
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it('デフォルトで直近2件と総数を返却する（Requirements: 2.1）', async () => {
    // Arrange
    const { SiteSurveyService } = await import('../../../services/site-survey.service.js');
    const mockService = vi.mocked(SiteSurveyService).mock.results[0]?.value;
    if (mockService) {
      mockService.findLatestByProjectId = vi.fn().mockResolvedValue({
        totalCount: 5,
        latestSurveys: [
          {
            id: 'survey-1',
            name: '第5回現場調査',
            surveyDate: '2024-05-15',
            thumbnailUrl: null,
            imageCount: 3,
          },
          {
            id: 'survey-2',
            name: '第4回現場調査',
            surveyDate: '2024-04-15',
            thumbnailUrl: null,
            imageCount: 2,
          },
        ],
      });
    }

    // Act
    const response = await request.get('/api/projects/project-123/site-surveys/latest');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.totalCount).toBe(5);
    expect(response.body.latestSurveys).toHaveLength(2);
  });

  it('limitクエリパラメータで取得件数を指定できる', async () => {
    // Arrange
    const { SiteSurveyService } = await import('../../../services/site-survey.service.js');
    const mockService = vi.mocked(SiteSurveyService).mock.results[0]?.value;
    if (mockService) {
      mockService.findLatestByProjectId = vi.fn().mockResolvedValue({
        totalCount: 10,
        latestSurveys: [
          { id: 'survey-1', name: '第10回現場調査' },
          { id: 'survey-2', name: '第9回現場調査' },
          { id: 'survey-3', name: '第8回現場調査' },
          { id: 'survey-4', name: '第7回現場調査' },
          { id: 'survey-5', name: '第6回現場調査' },
        ],
      });
    }

    // Act
    const response = await request.get('/api/projects/project-123/site-surveys/latest?limit=5');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.latestSurveys).toHaveLength(5);
  });

  it('limitの最大値は10', async () => {
    // Act
    const response = await request.get('/api/projects/project-123/site-surveys/latest?limit=20');

    // Assert
    expect(response.status).toBe(400);
  });

  it('limitの最小値は1', async () => {
    // Act
    const response = await request.get('/api/projects/project-123/site-surveys/latest?limit=0');

    // Assert
    expect(response.status).toBe(400);
  });

  it('不正なUUID形式のprojectIdは400エラーを返す', async () => {
    // Act
    const response = await request.get('/api/projects/invalid-project-id/site-surveys/latest');

    // Assert
    expect(response.status).toBe(400);
  });

  it('現場調査が0件の場合は空配列と総数0を返す', async () => {
    // Arrange
    const { SiteSurveyService } = await import('../../../services/site-survey.service.js');
    const mockService = vi.mocked(SiteSurveyService).mock.results[0]?.value;
    if (mockService) {
      mockService.findLatestByProjectId = vi.fn().mockResolvedValue({
        totalCount: 0,
        latestSurveys: [],
      });
    }

    // Act
    const response = await request.get('/api/projects/project-empty/site-surveys/latest');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.totalCount).toBe(0);
    expect(response.body.latestSurveys).toHaveLength(0);
  });
});
