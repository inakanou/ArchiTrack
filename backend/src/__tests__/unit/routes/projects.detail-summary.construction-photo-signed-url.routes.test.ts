/**
 * @fileoverview プロジェクト詳細サマリの工事写真セクションのサムネイル署名付きURLの有効期限のテスト
 *
 * Task 23.7: プロジェクト詳細の工事写真のパネルのサムネイルの署名付き URL に 15 分の有効期限を設定する
 *
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * @requirement construction-photo/REQ-11.6
 *
 * Scope:
 * - `GET /api/projects/:id/detail-summary` が工事写真のアルバムの代表サムネイルの署名付きURLを
 *   写真一覧・アルバム一覧と同じ 900 秒（15 分）の有効期限で生成すること。
 *   有効期限を渡さないとストレージプロバイダーの既定（3600 秒）になる。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

// モックサービスをvi.hoisted()で初期化
const mockProjectService = vi.hoisted(() => ({
  getProject: vi.fn(),
}));

const mockProjectStatusService = vi.hoisted(() => ({
  getStatusHistory: vi.fn(),
}));

const mockLatestEmpty = vi.hoisted(() => ({
  findLatestByProjectId: vi.fn(),
}));

const mockConstructionPhotoSummaryService = vi.hoisted(() => ({
  findLatestByProjectId: vi.fn(),
}));

const mockIsStorageConfigured = vi.hoisted(() => vi.fn());
const mockGetStorageProvider = vi.hoisted(() => vi.fn());

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
vi.mock('../../../services/project.service', () => ({
  ProjectService: class {
    constructor() {
      return mockProjectService;
    }
  },
}));

vi.mock('../../../services/project-status.service', () => ({
  ProjectStatusService: class {
    constructor() {
      return mockProjectStatusService;
    }
  },
}));

vi.mock('../../../services/audit-log.service', () => ({
  AuditLogService: class {
    constructor() {
      return { createLog: vi.fn().mockResolvedValue(undefined) };
    }
  },
}));

vi.mock('../../../services/site-survey.service', () => ({
  SiteSurveyService: class {
    constructor() {
      return mockLatestEmpty;
    }
  },
}));

vi.mock('../../../services/construction-photo-summary.service', () => ({
  ConstructionPhotoSummaryService: class {
    constructor() {
      return mockConstructionPhotoSummaryService;
    }
  },
}));

// モック: ストレージ（署名付きURLの生成の引数を観測する）
vi.mock('../../../storage/index', () => ({
  isStorageConfigured: (...args: unknown[]) => mockIsStorageConfigured(...args),
  getStorageProvider: (...args: unknown[]) => mockGetStorageProvider(...args),
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

// 実際のルートとミドルウェアをインポート（モックの後にインポート）
import projectsRouter from '../../../routes/projects.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

const TEST_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockProjectData = {
  id: TEST_PROJECT_ID,
  name: 'テストプロジェクト',
  tradingPartnerId: null,
  tradingPartner: null,
  salesPerson: { id: 'user-1', displayName: '営業太郎' },
  constructionPerson: null,
  siteAddress: '東京都',
  description: null,
  status: 'PREPARING',
  statusLabel: '準備中',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('GET /api/projects/:id/detail-summary - 工事写真のサムネイル署名付きURLの有効期限', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProjectService.getProject.mockResolvedValue(mockProjectData);
    mockProjectStatusService.getStatusHistory.mockResolvedValue([]);
    mockLatestEmpty.findLatestByProjectId.mockResolvedValue({
      totalCount: 0,
      latestSurveys: [],
    });

    app = express();
    app.use(express.json());
    app.use('/api/projects', projectsRouter);
    app.use(errorHandler);
  });

  it('アルバムの代表サムネイルの署名付きURLを 900 秒（15 分）の有効期限で生成する', async () => {
    mockConstructionPhotoSummaryService.findLatestByProjectId.mockResolvedValue({
      totalCount: 1,
      latestAlbums: [
        {
          id: 'album-1',
          projectId: TEST_PROJECT_ID,
          name: '基礎工事アルバム',
          memo: null,
          thumbnailUrl: 'construction-photos/album-1/thumb.jpg',
          representativeImageId: 'photo-1',
          photoCount: 6,
          createdAt: '2026-01-12T00:00:00.000Z',
          updatedAt: '2026-01-12T00:00:00.000Z',
        },
      ],
    });
    mockIsStorageConfigured.mockReturnValue(true);
    const mockStorageProvider = {
      getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/album-1-thumb.jpg'),
    };
    mockGetStorageProvider.mockReturnValue(mockStorageProvider);

    const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

    expect(response.status).toBe(200);
    expect(response.body.sections.constructionPhotos.latestAlbums[0].thumbnailUrl).toBe(
      'https://signed.example/album-1-thumb.jpg'
    );
    expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith(
      'construction-photos/album-1/thumb.jpg',
      { expiresIn: 900 }
    );
  });
});
