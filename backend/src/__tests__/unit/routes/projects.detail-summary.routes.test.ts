/**
 * @fileoverview プロジェクト詳細一括取得APIルートのテスト
 *
 * Task 48: バックエンドユニットテスト - プロジェクト詳細一括取得API
 * TDD: RED phase - テストを先に作成
 *
 * Requirements:
 * - 29.1: 一括取得APIエンドポイントの提供
 * - 29.3: レスポンスに各セクションのtotalCountとlatestデータを含める
 * - 29.4: 個別セクションエラー時のデフォルト値フォールバック
 * - 29.6: 既存個別APIと互換性のあるデータ構造
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

// モックサービスをvi.hoisted()で初期化
const mockProjectService = vi.hoisted(() => ({
  createProject: vi.fn(),
  getProjects: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getRelatedCounts: vi.fn(),
  getStatusCounts: vi.fn(),
}));

const mockProjectStatusService = vi.hoisted(() => ({
  getStatusHistory: vi.fn(),
  transitionStatus: vi.fn(),
  getAllowedTransitions: vi.fn(),
  getTransitionType: vi.fn(),
}));

const mockSiteSurveyService = vi.hoisted(() => ({
  findLatestByProjectId: vi.fn(),
}));

const mockQuantityTableService = vi.hoisted(() => ({
  findLatestByProjectId: vi.fn(),
}));

const mockItemizedStatementService = vi.hoisted(() => ({
  findLatestByProjectId: vi.fn(),
}));

const mockEstimateRequestService = vi.hoisted(() => ({
  findLatestByProjectId: vi.fn(),
}));

const mockEstimateService = vi.hoisted(() => ({
  findLatestByProjectId: vi.fn(),
}));

const mockConstructionPhotoSummaryService = vi.hoisted(() => ({
  findLatestByProjectId: vi.fn(),
}));

const mockAuditLogService = vi.hoisted(() => ({
  createLog: vi.fn().mockResolvedValue(undefined),
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
      return mockAuditLogService;
    }
  },
}));

vi.mock('../../../services/site-survey.service', () => ({
  SiteSurveyService: class {
    constructor() {
      return mockSiteSurveyService;
    }
  },
}));

vi.mock('../../../services/quantity-table.service', () => ({
  QuantityTableService: class {
    constructor() {
      return mockQuantityTableService;
    }
  },
}));

vi.mock('../../../services/itemized-statement.service', () => ({
  ItemizedStatementService: class {
    constructor() {
      return mockItemizedStatementService;
    }
  },
}));

vi.mock('../../../services/itemized-statement-pivot.service', () => ({
  ItemizedStatementPivotService: class {
    constructor() {
      return {};
    }
  },
}));

vi.mock('../../../services/estimate-request.service', () => ({
  EstimateRequestService: class {
    constructor() {
      return mockEstimateRequestService;
    }
  },
}));

vi.mock('../../../services/estimate.service', () => ({
  EstimateService: class {
    constructor() {
      return mockEstimateService;
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
vi.mock('../../../errors/projectError', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../errors/projectError.js')>();
  return {
    ...actual,
  };
});

// 実際のルートとミドルウェアをインポート（モックの後にインポート）
import projectsRouter from '../../../routes/projects.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';
import { ProjectNotFoundError } from '../../../errors/projectError.js';

// ============================================================================
// テストデータ
// ============================================================================

const TEST_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockProjectData = {
  id: TEST_PROJECT_ID,
  name: 'テストプロジェクト',
  tradingPartnerId: null,
  tradingPartner: null,
  salesPerson: { id: 'user-1', displayName: '営業太郎' },
  constructionPerson: null,
  siteAddress: '東京都',
  description: 'テスト説明',
  status: 'PREPARING',
  statusLabel: '準備中',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockStatusHistory = [
  {
    id: 'history-1',
    projectId: TEST_PROJECT_ID,
    fromStatus: null,
    toStatus: 'PREPARING',
    transitionType: 'initial',
    reason: null,
    changedBy: { id: 'user-1', displayName: '営業太郎' },
    changedAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockSurveySummary = {
  totalCount: 3,
  latestSurveys: [
    { id: 'survey-1', title: '調査1', surveyDate: '2026-01-10' },
    { id: 'survey-2', title: '調査2', surveyDate: '2026-01-05' },
  ],
};

const mockQuantityTableSummary = {
  totalCount: 2,
  latestTables: [
    {
      id: 'qt-1',
      name: '数量表1',
      updatedAt: '2026-01-10T00:00:00.000Z',
      itemCount: 10,
    },
  ],
};

const mockItemizedStatementSummary = {
  totalCount: 1,
  latestStatements: [
    {
      id: 'is-1',
      name: '内訳書1',
      createdAt: '2026-01-08T00:00:00.000Z',
      quantityTableName: '数量表1',
      itemCount: 5,
    },
  ],
};

const mockEstimateRequestSummary = {
  totalCount: 2,
  latestRequests: [{ id: 'er-1', tradingPartnerName: '業者A', status: 'REQUESTED' }],
};

const mockEstimateResult = {
  estimates: [
    {
      id: 'est-1',
      name: '見積書1',
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
      totalAmount: 1000000,
    },
  ],
  totalCount: 1,
};

const mockConstructionPhotoSummary = {
  totalCount: 4,
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
};

// ============================================================================
// テスト
// ============================================================================

describe('GET /api/projects/:id/detail-summary', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();

    // 工事写真サマリの既定値（各テストは必要に応じて上書き）
    mockConstructionPhotoSummaryService.findLatestByProjectId.mockResolvedValue({
      totalCount: 0,
      latestAlbums: [],
    });

    app = express();
    app.use(express.json());
    app.use('/api/projects', projectsRouter);
    app.use(errorHandler);
  });

  /**
   * 48.1: 認証済みユーザーがプロジェクト詳細一括データを取得できることを検証
   * Requirements: 29.1, 29.3
   */
  it('認証済みユーザーが全セクションを含む詳細サマリーを取得できる', async () => {
    // Arrange
    mockProjectService.getProject.mockResolvedValue(mockProjectData);
    mockProjectStatusService.getStatusHistory.mockResolvedValue(mockStatusHistory);
    mockSiteSurveyService.findLatestByProjectId.mockResolvedValue(mockSurveySummary);
    mockQuantityTableService.findLatestByProjectId.mockResolvedValue(mockQuantityTableSummary);
    mockItemizedStatementService.findLatestByProjectId.mockResolvedValue(
      mockItemizedStatementSummary
    );
    mockEstimateRequestService.findLatestByProjectId.mockResolvedValue(mockEstimateRequestSummary);
    mockEstimateService.findLatestByProjectId.mockResolvedValue(mockEstimateResult);

    // Act
    const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('project');
    expect(response.body).toHaveProperty('statusHistory');
    expect(response.body).toHaveProperty('sections');
    expect(response.body.project.id).toBe(TEST_PROJECT_ID);
    expect(response.body.statusHistory).toHaveLength(1);

    // セクション構造の検証
    const { sections } = response.body;
    expect(sections).toHaveProperty('siteSurveys');
    expect(sections).toHaveProperty('quantityTables');
    expect(sections).toHaveProperty('itemizedStatements');
    expect(sections).toHaveProperty('estimateRequests');
    expect(sections).toHaveProperty('estimates');

    // 各セクションにtotalCountとlatestデータが含まれることを検証
    expect(sections.siteSurveys.totalCount).toBe(3);
    expect(sections.siteSurveys.latestSurveys).toHaveLength(2);
    expect(sections.quantityTables.totalCount).toBe(2);
    expect(sections.quantityTables.latestTables).toHaveLength(1);
    expect(sections.itemizedStatements.totalCount).toBe(1);
    expect(sections.itemizedStatements.latestStatements).toHaveLength(1);
    expect(sections.estimateRequests.totalCount).toBe(2);
    expect(sections.estimateRequests.latestRequests).toHaveLength(1);
    expect(sections.estimates.totalCount).toBe(1);
    expect(sections.estimates.latestEstimates).toHaveLength(1);
  });

  /**
   * 48.1: レスポンスにstatusHistoryのラベルが含まれることを検証
   * Requirements: 29.3
   */
  it('statusHistoryにラベルが付与される', async () => {
    // Arrange
    mockProjectService.getProject.mockResolvedValue(mockProjectData);
    mockProjectStatusService.getStatusHistory.mockResolvedValue(mockStatusHistory);
    mockSiteSurveyService.findLatestByProjectId.mockResolvedValue(mockSurveySummary);
    mockQuantityTableService.findLatestByProjectId.mockResolvedValue(mockQuantityTableSummary);
    mockItemizedStatementService.findLatestByProjectId.mockResolvedValue(
      mockItemizedStatementSummary
    );
    mockEstimateRequestService.findLatestByProjectId.mockResolvedValue(mockEstimateRequestSummary);
    mockEstimateService.findLatestByProjectId.mockResolvedValue(mockEstimateResult);

    // Act
    const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.statusHistory[0]).toHaveProperty('toStatusLabel');
    expect(response.body.statusHistory[0]).toHaveProperty('transitionTypeLabel');
  });

  /**
   * 48.2: EstimateServiceのフィールド名変換（estimates -> latestEstimates）を検証
   * Requirements: 29.6
   */
  it('EstimateServiceのestimatesフィールドがlatestEstimatesに変換される', async () => {
    // Arrange
    mockProjectService.getProject.mockResolvedValue(mockProjectData);
    mockProjectStatusService.getStatusHistory.mockResolvedValue(mockStatusHistory);
    mockSiteSurveyService.findLatestByProjectId.mockResolvedValue({
      totalCount: 0,
      latestSurveys: [],
    });
    mockQuantityTableService.findLatestByProjectId.mockResolvedValue({
      totalCount: 0,
      latestTables: [],
    });
    mockItemizedStatementService.findLatestByProjectId.mockResolvedValue({
      totalCount: 0,
      latestStatements: [],
    });
    mockEstimateRequestService.findLatestByProjectId.mockResolvedValue({
      totalCount: 0,
      latestRequests: [],
    });
    mockEstimateService.findLatestByProjectId.mockResolvedValue({
      estimates: [{ id: 'est-1', name: '見積書1' }],
      totalCount: 1,
    });

    // Act
    const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

    // Assert
    expect(response.status).toBe(200);
    // estimates -> latestEstimates への変換
    expect(response.body.sections.estimates.latestEstimates).toBeDefined();
    expect(response.body.sections.estimates.latestEstimates).toHaveLength(1);
    expect(response.body.sections.estimates.latestEstimates[0].id).toBe('est-1');
    // 変換前のフィールド名が残っていないことを確認
    expect(response.body.sections.estimates.estimates).toBeUndefined();
  });

  /**
   * 48.2: 個別セクションがエラーをスローした場合のフォールバックを検証
   * Requirements: 29.4
   */
  it('個別セクションエラー時にデフォルト値にフォールバックし他セクションは正常', async () => {
    // Arrange
    mockProjectService.getProject.mockResolvedValue(mockProjectData);
    mockProjectStatusService.getStatusHistory.mockResolvedValue(mockStatusHistory);

    // SiteSurveyServiceがエラーをスロー
    mockSiteSurveyService.findLatestByProjectId.mockRejectedValue(
      new Error('Database connection error')
    );
    // 他のサービスは正常
    mockQuantityTableService.findLatestByProjectId.mockResolvedValue(mockQuantityTableSummary);
    mockItemizedStatementService.findLatestByProjectId.mockResolvedValue(
      mockItemizedStatementSummary
    );
    mockEstimateRequestService.findLatestByProjectId.mockResolvedValue(mockEstimateRequestSummary);
    mockEstimateService.findLatestByProjectId.mockResolvedValue(mockEstimateResult);

    // Act
    const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

    // Assert
    expect(response.status).toBe(200);

    // エラーしたセクションはデフォルト値
    expect(response.body.sections.siteSurveys).toEqual({
      totalCount: 0,
      latestSurveys: [],
    });

    // 他のセクションは正常値
    expect(response.body.sections.quantityTables.totalCount).toBe(2);
    expect(response.body.sections.itemizedStatements.totalCount).toBe(1);
    expect(response.body.sections.estimateRequests.totalCount).toBe(2);
    expect(response.body.sections.estimates.totalCount).toBe(1);
  });

  /**
   * 48.2: 全セクションがエラーの場合でも全セクションがデフォルト値で返却される
   * Requirements: 29.4
   */
  it('全セクションがエラーでも全セクションがデフォルト値で返却される', async () => {
    // Arrange
    mockProjectService.getProject.mockResolvedValue(mockProjectData);
    mockProjectStatusService.getStatusHistory.mockResolvedValue(mockStatusHistory);
    mockSiteSurveyService.findLatestByProjectId.mockRejectedValue(new Error('DB error'));
    mockQuantityTableService.findLatestByProjectId.mockRejectedValue(new Error('DB error'));
    mockItemizedStatementService.findLatestByProjectId.mockRejectedValue(new Error('DB error'));
    mockEstimateRequestService.findLatestByProjectId.mockRejectedValue(new Error('DB error'));
    mockEstimateService.findLatestByProjectId.mockRejectedValue(new Error('DB error'));

    // Act
    const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.sections.siteSurveys).toEqual({ totalCount: 0, latestSurveys: [] });
    expect(response.body.sections.quantityTables).toEqual({ totalCount: 0, latestTables: [] });
    expect(response.body.sections.itemizedStatements).toEqual({
      totalCount: 0,
      latestStatements: [],
    });
    expect(response.body.sections.estimateRequests).toEqual({
      totalCount: 0,
      latestRequests: [],
    });
    expect(response.body.sections.estimates).toEqual({ totalCount: 0, latestEstimates: [] });
  });

  /**
   * 4.1: 工事写真セクションが既存セクションと同型で含まれることを検証
   * Requirements: 2.3
   */
  it('sections に constructionPhotos:{totalCount, latestAlbums} が同型で含まれる', async () => {
    // Arrange
    mockProjectService.getProject.mockResolvedValue(mockProjectData);
    mockProjectStatusService.getStatusHistory.mockResolvedValue(mockStatusHistory);
    mockSiteSurveyService.findLatestByProjectId.mockResolvedValue(mockSurveySummary);
    mockQuantityTableService.findLatestByProjectId.mockResolvedValue(mockQuantityTableSummary);
    mockItemizedStatementService.findLatestByProjectId.mockResolvedValue(
      mockItemizedStatementSummary
    );
    mockEstimateRequestService.findLatestByProjectId.mockResolvedValue(mockEstimateRequestSummary);
    mockEstimateService.findLatestByProjectId.mockResolvedValue(mockEstimateResult);
    mockConstructionPhotoSummaryService.findLatestByProjectId.mockResolvedValue(
      mockConstructionPhotoSummary
    );

    // Act
    const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.sections).toHaveProperty('constructionPhotos');
    expect(response.body.sections.constructionPhotos.totalCount).toBe(4);
    expect(response.body.sections.constructionPhotos.latestAlbums).toHaveLength(1);
    expect(response.body.sections.constructionPhotos.latestAlbums[0]).toMatchObject({
      id: 'album-1',
      name: '基礎工事アルバム',
      photoCount: 6,
    });
    // 他セクションが壊れていないこと（回帰）
    expect(response.body.sections.siteSurveys.totalCount).toBe(3);
    expect(response.body.sections.estimates.totalCount).toBe(1);
  });

  /**
   * 4.1: 工事写真サマリ失敗時もフォールバックで応答が壊れず他セクションに影響しない
   * Requirements: 2.3
   */
  it('工事写真サマリ失敗時に constructionPhotos がフォールバックし他セクションは正常', async () => {
    // Arrange
    mockProjectService.getProject.mockResolvedValue(mockProjectData);
    mockProjectStatusService.getStatusHistory.mockResolvedValue(mockStatusHistory);
    mockSiteSurveyService.findLatestByProjectId.mockResolvedValue(mockSurveySummary);
    mockQuantityTableService.findLatestByProjectId.mockResolvedValue(mockQuantityTableSummary);
    mockItemizedStatementService.findLatestByProjectId.mockResolvedValue(
      mockItemizedStatementSummary
    );
    mockEstimateRequestService.findLatestByProjectId.mockResolvedValue(mockEstimateRequestSummary);
    mockEstimateService.findLatestByProjectId.mockResolvedValue(mockEstimateResult);
    mockConstructionPhotoSummaryService.findLatestByProjectId.mockRejectedValue(
      new Error('Database connection error')
    );

    // Act
    const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.sections.constructionPhotos).toEqual({
      totalCount: 0,
      latestAlbums: [],
    });
    // 他セクションは正常
    expect(response.body.sections.siteSurveys.totalCount).toBe(3);
    expect(response.body.sections.quantityTables.totalCount).toBe(2);
    expect(response.body.sections.estimates.totalCount).toBe(1);
  });

  /**
   * 48.1: 存在しないプロジェクトIDでの404エラーを検証
   * Requirements: 29.1
   */
  it('存在しないプロジェクトIDで404を返却する', async () => {
    // Arrange
    const nonExistentId = 'a0000000-0000-4000-a000-000000000000';
    mockProjectService.getProject.mockRejectedValue(new ProjectNotFoundError(nonExistentId));

    // Act
    const response = await request(app).get(`/api/projects/${nonExistentId}/detail-summary`);

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('PROJECT_NOT_FOUND');
  });

  /**
   * 48.1: プロジェクト基本情報取得成功後にステータス履歴取得失敗した場合
   */
  it('ステータス履歴取得失敗時にエラーが伝播する', async () => {
    // Arrange
    mockProjectService.getProject.mockResolvedValue(mockProjectData);
    mockProjectStatusService.getStatusHistory.mockRejectedValue(new Error('History fetch failed'));

    // Act
    const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

    // Assert: プロジェクト基本情報・ステータス履歴は必須データなので500エラー
    expect(response.status).toBe(500);
  });
});
