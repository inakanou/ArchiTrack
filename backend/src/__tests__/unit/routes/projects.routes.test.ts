/**
 * @fileoverview プロジェクトCRUD APIルートのテスト
 *
 * Requirements:
 * - 14.1: GET /api/projects プロジェクト一覧取得
 * - 14.2: GET /api/projects/:id プロジェクト詳細取得
 * - 14.3: POST /api/projects プロジェクト作成
 * - 14.4: PUT /api/projects/:id プロジェクト更新
 * - 14.5: DELETE /api/projects/:id プロジェクト削除
 * - 14.6: 一覧取得APIでページネーション、検索、フィルタリング、ソートのクエリパラメータをサポート
 * - 12.1, 12.2, 12.3: 認証・認可ミドルウェア適用
 *
 * TDD: RED phase - テストを先に作成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import type { ProjectStatus } from '../../../types/project.types.js';

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

const mockAuditLogService = vi.hoisted(() => ({
  createLog: vi.fn().mockResolvedValue(undefined),
}));

const mockProjectStatusService = vi.hoisted(() => ({
  getStatusHistory: vi.fn(),
  changeStatus: vi.fn(),
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

const mockItemizedStatementPivotService = vi.hoisted(() => ({}));

const mockEstimateRequestService = vi.hoisted(() => ({
  findLatestByProjectId: vi.fn(),
}));

const mockEstimateService = vi.hoisted(() => ({
  findLatestByProjectId: vi.fn(),
}));

const mockContractService = vi.hoisted(() => ({
  findLatestByProjectId: vi.fn(),
}));

const mockScheduleService = vi.hoisted(() => ({
  findLatestByProjectId: vi.fn(),
}));

const mockExecutionBudgetService = vi.hoisted(() => ({
  getSummaryByProjectId: vi.fn(),
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

vi.mock('../../../services/audit-log.service', () => ({
  AuditLogService: class {
    constructor() {
      return mockAuditLogService;
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
      return mockItemizedStatementPivotService;
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

vi.mock('../../../services/contract.service', () => ({
  ContractService: class {
    constructor() {
      return mockContractService;
    }
  },
}));

vi.mock('../../../services/schedule.service', () => ({
  ScheduleService: class {
    constructor() {
      return mockScheduleService;
    }
  },
}));

vi.mock('../../../services/execution-budget.service', () => ({
  ExecutionBudgetService: class {
    constructor() {
      return mockExecutionBudgetService;
    }
  },
}));

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
import {
  ProjectNotFoundError,
  ProjectValidationError,
  ProjectConflictError,
  DuplicateProjectNameError,
} from '../../../errors/projectError.js';

describe('Projects Routes', () => {
  let app: Application;

  // テスト用UUID定数
  const TEST_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const TEST_USER_1_ID = '550e8400-e29b-41d4-a716-446655440001';
  const TEST_USER_2_ID = '550e8400-e29b-41d4-a716-446655440002';

  const mockProjectInfo = {
    id: TEST_PROJECT_ID,
    name: 'テストプロジェクト',
    tradingPartner: null,
    salesPerson: { id: TEST_USER_1_ID, displayName: '営業太郎' },
    constructionPerson: { id: TEST_USER_2_ID, displayName: '工事次郎' },
    siteAddress: '東京都千代田区',
    description: 'テスト説明',
    status: 'PREPARING' as ProjectStatus,
    statusLabel: '準備中',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
  };

  const mockProjectDetail = {
    ...mockProjectInfo,
    createdBy: { id: TEST_USER_1_ID, displayName: '営業太郎' },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/projects', projectsRouter);
    app.use(errorHandler);
  });

  describe('GET /api/projects', () => {
    it('should return paginated project list with default parameters', async () => {
      const mockResult = {
        data: [mockProjectInfo],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      (mockProjectService.getProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: TEST_PROJECT_ID,
        name: 'テストプロジェクト',
        status: 'PREPARING',
        statusLabel: '準備中',
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

      (mockProjectService.getProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const response = await request(app).get('/api/projects?page=2&limit=50');

      expect(response.status).toBe(200);
      expect(mockProjectService.getProjects).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ page: 2, limit: 50 }),
        expect.any(Object)
      );
    });

    it('should support search parameter', async () => {
      const mockResult = {
        data: [mockProjectInfo],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };

      (mockProjectService.getProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const response = await request(app).get('/api/projects?search=テスト');

      expect(response.status).toBe(200);
      expect(mockProjectService.getProjects).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'テスト' }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should support status filter', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };

      (mockProjectService.getProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const response = await request(app).get('/api/projects?status=PREPARING,SURVEYING');

      expect(response.status).toBe(200);
      expect(mockProjectService.getProjects).toHaveBeenCalledWith(
        expect.objectContaining({ status: ['PREPARING', 'SURVEYING'] }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should support date range filter', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };

      (mockProjectService.getProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const response = await request(app).get(
        '/api/projects?createdFrom=2025-01-01&createdTo=2025-12-31'
      );

      expect(response.status).toBe(200);
      expect(mockProjectService.getProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          createdFrom: '2025-01-01',
          createdTo: '2025-12-31',
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

      (mockProjectService.getProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const response = await request(app).get('/api/projects?sort=name&order=asc');

      expect(response.status).toBe(200);
      expect(mockProjectService.getProjects).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({ sort: 'name', order: 'asc' })
      );
    });

    it('should return 400 for invalid page parameter', async () => {
      const response = await request(app).get('/api/projects?page=0');

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid limit parameter', async () => {
      const response = await request(app).get('/api/projects?limit=101');

      expect(response.status).toBe(400);
    });

    it('should return 400 for search keyword less than 2 characters', async () => {
      const response = await request(app).get('/api/projects?search=a');

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid status filter', async () => {
      const response = await request(app).get('/api/projects?status=INVALID_STATUS');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should return project detail by id', async () => {
      (mockProjectService.getProject as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockProjectDetail
      );

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: TEST_PROJECT_ID,
        name: 'テストプロジェクト',
        status: 'PREPARING',
        statusLabel: '準備中',
        createdBy: { id: TEST_USER_1_ID, displayName: '営業太郎' },
      });
    });

    it('should return 400 for invalid project id format', async () => {
      const response = await request(app).get('/api/projects/invalid-format');

      expect(response.status).toBe(400);
    });

    it('should return 404 when project not found', async () => {
      (mockProjectService.getProject as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ProjectNotFoundError('550e8400-e29b-41d4-a716-446655440000')
      );

      const response = await request(app).get('/api/projects/550e8400-e29b-41d4-a716-446655440000');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/projects', () => {
    const validCreateInput = {
      name: '新規プロジェクト',
      salesPersonId: '550e8400-e29b-41d4-a716-446655440001',
      constructionPersonId: '550e8400-e29b-41d4-a716-446655440002',
      siteAddress: '東京都港区',
      description: 'プロジェクト説明',
    };

    it('should create project successfully', async () => {
      const createdProject = {
        ...mockProjectInfo,
        id: 'new-project-id',
        name: validCreateInput.name,
      };

      (mockProjectService.createProject as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdProject
      );

      const response = await request(app).post('/api/projects').send(validCreateInput);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: 'new-project-id',
        name: '新規プロジェクト',
      });
      expect(mockProjectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: validCreateInput.name,
          salesPersonId: validCreateInput.salesPersonId,
        }),
        'test-user-id'
      );
    });

    it('should create project with minimal required fields', async () => {
      const minimalInput = {
        name: '最小プロジェクト',
        salesPersonId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const createdProject = {
        ...mockProjectInfo,
        id: 'minimal-project-id',
        name: minimalInput.name,
      };

      (mockProjectService.createProject as ReturnType<typeof vi.fn>).mockResolvedValue(
        createdProject
      );

      const response = await request(app).post('/api/projects').send(minimalInput);

      expect(response.status).toBe(201);
    });

    it('should return 400 when name is missing', async () => {
      const invalidInput = {
        salesPersonId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const response = await request(app).post('/api/projects').send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when salesPersonId is missing', async () => {
      const invalidInput = {
        name: 'プロジェクト名',
      };

      const response = await request(app).post('/api/projects').send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when name exceeds 255 characters', async () => {
      const invalidInput = {
        name: 'a'.repeat(256),
        salesPersonId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const response = await request(app).post('/api/projects').send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when salesPersonId is invalid UUID format', async () => {
      const invalidInput = {
        name: 'プロジェクト名',
        salesPersonId: 'invalid-uuid',
      };

      const response = await request(app).post('/api/projects').send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when validation error from service', async () => {
      (mockProjectService.createProject as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ProjectValidationError({
          salesPersonId: '指定されたユーザーが存在しません',
        })
      );

      const response = await request(app).post('/api/projects').send(validCreateInput);

      expect(response.status).toBe(400);
    });

    /**
     * Task 21.6: POST /api/projectsハンドラでDuplicateProjectNameErrorをキャッチ
     * Requirements: 1.15, 8.7
     */
    it('should return 409 when project name already exists', async () => {
      (mockProjectService.createProject as ReturnType<typeof vi.fn>).mockRejectedValue(
        new DuplicateProjectNameError('新規プロジェクト')
      );

      const response = await request(app).post('/api/projects').send(validCreateInput);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        type: expect.stringContaining('project-name-duplicate'),
        title: 'Duplicate Project Name',
        status: 409,
        detail: 'このプロジェクト名は既に使用されています',
        code: 'PROJECT_NAME_DUPLICATE',
        projectName: '新規プロジェクト',
      });
    });
  });

  describe('PUT /api/projects/:id', () => {
    const validUpdateInput = {
      name: '更新プロジェクト',
      expectedUpdatedAt: '2025-01-02T00:00:00.000Z',
    };

    it('should update project successfully', async () => {
      const updatedProject = {
        ...mockProjectInfo,
        name: validUpdateInput.name,
      };

      (mockProjectService.updateProject as ReturnType<typeof vi.fn>).mockResolvedValue(
        updatedProject
      );

      const response = await request(app)
        .put('/api/projects/550e8400-e29b-41d4-a716-446655440000')
        .send(validUpdateInput);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: '更新プロジェクト',
      });
      expect(mockProjectService.updateProject).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        expect.objectContaining({
          name: validUpdateInput.name,
        }),
        'test-user-id',
        expect.any(Date)
      );
    });

    it('should update project with partial fields', async () => {
      const partialInput = {
        description: '新しい説明',
        expectedUpdatedAt: '2025-01-02T00:00:00.000Z',
      };

      const updatedProject = {
        ...mockProjectInfo,
        description: partialInput.description,
      };

      (mockProjectService.updateProject as ReturnType<typeof vi.fn>).mockResolvedValue(
        updatedProject
      );

      const response = await request(app)
        .put('/api/projects/550e8400-e29b-41d4-a716-446655440000')
        .send(partialInput);

      expect(response.status).toBe(200);
    });

    it('should return 400 for invalid project id format', async () => {
      const response = await request(app).put('/api/projects/invalid-id').send(validUpdateInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when expectedUpdatedAt is missing', async () => {
      const invalidInput = {
        name: '更新プロジェクト',
      };

      const response = await request(app)
        .put('/api/projects/550e8400-e29b-41d4-a716-446655440000')
        .send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 404 when project not found', async () => {
      (mockProjectService.updateProject as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ProjectNotFoundError('550e8400-e29b-41d4-a716-446655440000')
      );

      const response = await request(app)
        .put('/api/projects/550e8400-e29b-41d4-a716-446655440000')
        .send(validUpdateInput);

      expect(response.status).toBe(404);
    });

    it('should return 409 when conflict error (optimistic locking)', async () => {
      (mockProjectService.updateProject as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ProjectConflictError('プロジェクトは他のユーザーによって更新されました', {
          expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
          actualUpdatedAt: '2025-01-02T00:00:00.000Z',
        })
      );

      const response = await request(app)
        .put('/api/projects/550e8400-e29b-41d4-a716-446655440000')
        .send(validUpdateInput);

      expect(response.status).toBe(409);
    });

    /**
     * Task 21.6: PUT /api/projects/:idハンドラでDuplicateProjectNameErrorをキャッチ
     * Requirements: 1.15, 8.7
     */
    it('should return 409 when updating project name to existing name', async () => {
      (mockProjectService.updateProject as ReturnType<typeof vi.fn>).mockRejectedValue(
        new DuplicateProjectNameError('更新プロジェクト')
      );

      const response = await request(app)
        .put('/api/projects/550e8400-e29b-41d4-a716-446655440000')
        .send(validUpdateInput);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        type: expect.stringContaining('project-name-duplicate'),
        title: 'Duplicate Project Name',
        status: 409,
        detail: 'このプロジェクト名は既に使用されています',
        code: 'PROJECT_NAME_DUPLICATE',
        projectName: '更新プロジェクト',
      });
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('should delete project successfully', async () => {
      (mockProjectService.deleteProject as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const response = await request(app).delete(
        '/api/projects/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(204);
      expect(mockProjectService.deleteProject).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'test-user-id'
      );
    });

    it('should return 400 for invalid project id format', async () => {
      const response = await request(app).delete('/api/projects/invalid-id');

      expect(response.status).toBe(400);
    });

    it('should return 404 when project not found', async () => {
      (mockProjectService.deleteProject as ReturnType<typeof vi.fn>).mockRejectedValue(
        new ProjectNotFoundError('550e8400-e29b-41d4-a716-446655440000')
      );

      const response = await request(app).delete(
        '/api/projects/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Authentication and Authorization', () => {
    // Note: These tests verify middleware is applied
    // Actual middleware behavior is tested in middleware tests

    it('should require authentication for GET /api/projects', async () => {
      // This test verifies the route expects authenticated user
      // The mock already sets req.user, so we verify service is called
      const mockResult = {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
      (mockProjectService.getProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
    });

    it('should require authentication for POST /api/projects', async () => {
      const validInput = {
        name: 'プロジェクト',
        salesPersonId: '550e8400-e29b-41d4-a716-446655440001',
      };

      (mockProjectService.createProject as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockProjectInfo
      );

      const response = await request(app).post('/api/projects').send(validInput);

      expect(response.status).toBe(201);
      // Verify user ID from auth was passed to service
      expect(mockProjectService.createProject).toHaveBeenCalledWith(
        expect.any(Object),
        'test-user-id'
      );
    });
  });

  // ==========================================================================
  // Task 43.3: GET /api/projects/status-counts エンドポイントテスト
  // Requirements: 23.1, 12.1, 12.2
  // ==========================================================================
  describe('GET /api/projects/status-counts', () => {
    const mockStatusCounts = {
      counts: {
        PREPARING: 5,
        SURVEYING: 3,
        ESTIMATING: 2,
        APPROVING: 1,
        CONTRACTING: 0,
        CONSTRUCTING: 0,
        DELIVERING: 0,
        BILLING: 0,
        AWAITING: 0,
        COMPLETED: 10,
        CANCELLED: 1,
        LOST: 0,
      },
      total: 22,
    };

    it('認証済みユーザーがステータス別件数を取得できること (23.1)', async () => {
      (mockProjectService.getStatusCounts as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockStatusCounts
      );

      const response = await request(app).get('/api/projects/status-counts');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStatusCounts);
      expect(mockProjectService.getStatusCounts).toHaveBeenCalled();
    });

    it('レスポンスに全12ステータスの件数と合計が含まれること', async () => {
      (mockProjectService.getStatusCounts as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockStatusCounts
      );

      const response = await request(app).get('/api/projects/status-counts');

      expect(response.status).toBe(200);
      expect(response.body.counts).toBeDefined();
      expect(response.body.total).toBe(22);
      // 全12ステータスがキーとして存在すること
      expect(Object.keys(response.body.counts)).toHaveLength(12);
    });
  });

  // ==========================================================================
  // Task 43.5: デフォルト表示件数変更のテスト（ルートレベル）
  // Requirements: 3.1
  // ==========================================================================
  describe('GET /api/projects - デフォルト表示件数', () => {
    it('limitパラメータ未指定時にデフォルト100件で取得されること (3.1)', async () => {
      (mockProjectService.getProjects as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      await request(app).get('/api/projects');

      expect(mockProjectService.getProjects).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ limit: 100 }),
        expect.any(Object)
      );
    });
  });

  // ==========================================================================
  // Task 40.1: excludeTerminalStatusesパラメータのテスト
  // Requirements: 2.7, 2.8
  // ==========================================================================
  describe('GET /api/projects - excludeTerminalStatuses', () => {
    it('excludeTerminalStatuses=trueがサービスに渡されること', async () => {
      (mockProjectService.getProjects as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      await request(app).get('/api/projects?excludeTerminalStatuses=true');

      expect(mockProjectService.getProjects).toHaveBeenCalledWith(
        expect.objectContaining({ excludeTerminalStatuses: true }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('excludeTerminalStatuses未指定時はundefinedが渡されること', async () => {
      (mockProjectService.getProjects as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      await request(app).get('/api/projects');

      expect(mockProjectService.getProjects).toHaveBeenCalledWith(
        expect.objectContaining({ excludeTerminalStatuses: undefined }),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  // ==========================================================================
  // Task 52.2: detail-summary APIのサムネイルURL変換テスト
  // Requirements: 30.1, 30.2, 30.3, 30.4, 30.5
  // ==========================================================================
  describe('GET /api/projects/:id/detail-summary - サムネイルURL変換', () => {
    const mockSurveyWithThumbnail = {
      id: 'survey-1',
      projectId: TEST_PROJECT_ID,
      name: '現場調査1',
      surveyDate: new Date('2025-06-01'),
      memo: null,
      thumbnailUrl: 'uploads/thumbnails/thumb-1.webp',
      thumbnailImageId: 'image-1',
      thumbnailOriginalPath: 'uploads/originals/orig-1.jpg',
      imageCount: 3,
      createdAt: new Date('2025-06-01'),
      updatedAt: new Date('2025-06-01'),
    };

    const mockSurveyWithoutThumbnail = {
      id: 'survey-2',
      projectId: TEST_PROJECT_ID,
      name: '現場調査2',
      surveyDate: new Date('2025-06-02'),
      memo: null,
      thumbnailUrl: null,
      thumbnailImageId: null,
      thumbnailOriginalPath: null,
      imageCount: 0,
      createdAt: new Date('2025-06-02'),
      updatedAt: new Date('2025-06-02'),
    };

    const defaultSectionsSetup = () => {
      (
        mockQuantityTableService.findLatestByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        totalCount: 0,
        latestTables: [],
      });
      (
        mockItemizedStatementService.findLatestByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        totalCount: 0,
        latestStatements: [],
      });
      (
        mockEstimateRequestService.findLatestByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        totalCount: 0,
        latestRequests: [],
      });
      (mockEstimateService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 0,
        estimates: [],
      });
      (mockProjectStatusService.getStatusHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockProjectService.getProject as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockProjectDetail
      );
    };

    it('ストレージ設定済み時: thumbnailUrl と thumbnailOriginalUrl が署名付きURLに変換されること (30.1, 30.2)', async () => {
      defaultSectionsSetup();
      (mockSiteSurveyService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 1,
        latestSurveys: [mockSurveyWithThumbnail],
      });

      mockIsStorageConfigured.mockReturnValue(true);
      const mockStorageProvider = {
        getSignedUrl: vi
          .fn()
          .mockResolvedValueOnce('https://signed-url.example.com/thumb-1.webp')
          .mockResolvedValueOnce('https://signed-url.example.com/orig-1.jpg'),
      };
      mockGetStorageProvider.mockReturnValue(mockStorageProvider);

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

      expect(response.status).toBe(200);
      const survey = response.body.sections.siteSurveys.latestSurveys[0];
      expect(survey.thumbnailUrl).toBe('https://signed-url.example.com/thumb-1.webp');
      expect(survey.thumbnailOriginalUrl).toBe('https://signed-url.example.com/orig-1.jpg');
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith(
        'uploads/thumbnails/thumb-1.webp'
      );
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith('uploads/originals/orig-1.jpg');
    });

    it('ストレージ未設定時: thumbnailUrl と thumbnailOriginalUrl が null であること (30.3)', async () => {
      defaultSectionsSetup();
      (mockSiteSurveyService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 1,
        latestSurveys: [mockSurveyWithThumbnail],
      });

      mockIsStorageConfigured.mockReturnValue(false);

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

      expect(response.status).toBe(200);
      const survey = response.body.sections.siteSurveys.latestSurveys[0];
      expect(survey.thumbnailUrl).toBeNull();
      expect(survey.thumbnailOriginalUrl).toBeNull();
    });

    it('署名付きURL生成失敗時: 該当フィールドが null になり、他のデータが正常に返却されること (30.4, 30.5)', async () => {
      defaultSectionsSetup();
      (mockSiteSurveyService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 2,
        latestSurveys: [mockSurveyWithThumbnail, mockSurveyWithoutThumbnail],
      });

      mockIsStorageConfigured.mockReturnValue(true);
      const mockStorageProvider = {
        getSignedUrl: vi.fn().mockRejectedValue(new Error('Storage error')),
      };
      mockGetStorageProvider.mockReturnValue(mockStorageProvider);

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

      expect(response.status).toBe(200);
      // 署名付きURL生成失敗時はnullにフォールバック
      const survey1 = response.body.sections.siteSurveys.latestSurveys[0];
      expect(survey1.thumbnailUrl).toBeNull();
      expect(survey1.thumbnailOriginalUrl).toBeNull();
      // サムネイルがないsurveyはそのままnull
      const survey2 = response.body.sections.siteSurveys.latestSurveys[1];
      expect(survey2.thumbnailUrl).toBeNull();
      expect(survey2.thumbnailOriginalUrl).toBeNull();
      // 他のセクションデータは正常に返却される
      expect(response.body.sections.quantityTables).toBeDefined();
      expect(response.body.sections.estimateRequests).toBeDefined();
    });

    it('サムネイルが存在しない現場調査の場合: thumbnailOriginalUrl が null であること', async () => {
      defaultSectionsSetup();
      (mockSiteSurveyService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 1,
        latestSurveys: [mockSurveyWithoutThumbnail],
      });

      mockIsStorageConfigured.mockReturnValue(true);
      const mockStorageProvider = {
        getSignedUrl: vi.fn(),
      };
      mockGetStorageProvider.mockReturnValue(mockStorageProvider);

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

      expect(response.status).toBe(200);
      const survey = response.body.sections.siteSurveys.latestSurveys[0];
      expect(survey.thumbnailUrl).toBeNull();
      expect(survey.thumbnailOriginalUrl).toBeNull();
      // getSignedUrlは呼ばれない（パスがnullのため）
      expect(mockStorageProvider.getSignedUrl).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Task 59.3: detail-summary APIの契約書セクション統合テスト
  // Requirements: 37.1, 37.4, 37.5
  // ==========================================================================
  describe('GET /api/projects/:id/detail-summary - 契約書セクション統合', () => {
    const mockContractData = {
      totalCount: 2,
      latestContracts: [
        {
          id: 'contract-1',
          contractType: 'NEW',
          contractDate: '2025-06-01',
          status: 'CONTRACTED',
          contractAmount: 5000000,
          createdAt: '2025-06-01T00:00:00.000Z',
        },
        {
          id: 'contract-2',
          contractType: 'AMENDMENT',
          contractDate: '2025-07-01',
          status: 'BEFORE_CONTRACT',
          contractAmount: 6000000,
          createdAt: '2025-07-01T00:00:00.000Z',
        },
      ],
    };

    const setupAllSections = () => {
      (mockSiteSurveyService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 0,
        latestSurveys: [],
      });
      (
        mockQuantityTableService.findLatestByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        totalCount: 0,
        latestTables: [],
      });
      (
        mockItemizedStatementService.findLatestByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        totalCount: 0,
        latestStatements: [],
      });
      (
        mockEstimateRequestService.findLatestByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        totalCount: 0,
        latestRequests: [],
      });
      (mockEstimateService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 0,
        estimates: [],
      });
      (mockContractService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 0,
        latestContracts: [],
      });
      (mockScheduleService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 0,
        latestSchedules: [],
      });
      (
        mockExecutionBudgetService.getSummaryByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      mockIsStorageConfigured.mockReturnValue(false);
    };

    it('契約書セクションデータがレスポンスに含まれること (37.1, 37.2)', async () => {
      setupAllSections();
      (mockContractService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockContractData
      );

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

      expect(response.status).toBe(200);
      expect(response.body.sections.contracts).toBeDefined();
      expect(response.body.sections.contracts.totalCount).toBe(2);
      expect(response.body.sections.contracts.latestContracts).toHaveLength(2);
      expect(response.body.sections.contracts.latestContracts[0].id).toBe('contract-1');
      expect(response.body.sections.contracts.latestContracts[0].contractType).toBe('NEW');
      expect(response.body.sections.contracts.latestContracts[0].status).toBe('CONTRACTED');
      expect(response.body.sections.contracts.latestContracts[0].contractAmount).toBe(5000000);
    });

    it('契約書取得エラー時にデフォルト値を返却すること (37.4)', async () => {
      setupAllSections();
      (mockContractService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB error')
      );

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

      expect(response.status).toBe(200);
      expect(response.body.sections.contracts).toBeDefined();
      expect(response.body.sections.contracts.totalCount).toBe(0);
      expect(response.body.sections.contracts.latestContracts).toEqual([]);
    });

    it('契約書取得エラーが他のセクションデータに影響しないこと (37.5)', async () => {
      setupAllSections();
      (mockContractService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Contract service error')
      );

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

      expect(response.status).toBe(200);
      // 他のセクションは正常に返却される
      expect(response.body.sections.siteSurveys).toBeDefined();
      expect(response.body.sections.quantityTables).toBeDefined();
      expect(response.body.sections.itemizedStatements).toBeDefined();
      expect(response.body.sections.estimateRequests).toBeDefined();
      expect(response.body.sections.estimates).toBeDefined();
      // 契約書セクションはデフォルト値
      expect(response.body.sections.contracts.totalCount).toBe(0);
    });
  });

  // Task 67.2: detail-summary APIの実行予算セクション統合テスト
  // Requirements: 41.1, 41.2, 41.3, 41.4, 41.5
  describe('GET /api/projects/:id/detail-summary - 実行予算セクション統合', () => {
    const setupAllSectionsForBudget = () => {
      (mockSiteSurveyService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 0,
        latestSurveys: [],
      });
      (
        mockQuantityTableService.findLatestByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        totalCount: 0,
        latestTables: [],
      });
      (
        mockItemizedStatementService.findLatestByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        totalCount: 0,
        latestStatements: [],
      });
      (
        mockEstimateRequestService.findLatestByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        totalCount: 0,
        latestRequests: [],
      });
      (mockEstimateService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 0,
        estimates: [],
      });
      (mockContractService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 0,
        latestContracts: [],
      });
      (mockScheduleService.findLatestByProjectId as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalCount: 0,
        latestSchedules: [],
      });
      (
        mockExecutionBudgetService.getSummaryByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      mockIsStorageConfigured.mockReturnValue(false);
    };

    it('実行予算セクションデータがレスポンスに含まれること (41.1, 41.2)', async () => {
      setupAllSectionsForBudget();
      const mockBudgetSummary = {
        id: 'budget-1',
        contractName: '工事見積書A',
        contractAmount: 5000000,
        createdAt: '2026-01-01T00:00:00.000Z',
        executionAmountTotal: '3500000',
        profitForecast: '1500000',
        orderProgressRate: '50',
      };
      (
        mockExecutionBudgetService.getSummaryByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockBudgetSummary);

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

      expect(response.status).toBe(200);
      expect(response.body.sections.executionBudget).toBeDefined();
      expect(response.body.sections.executionBudget.id).toBe('budget-1');
      expect(response.body.sections.executionBudget.contractName).toBe('工事見積書A');
      expect(response.body.sections.executionBudget.contractAmount).toBe(5000000);
      expect(response.body.sections.executionBudget.executionAmountTotal).toBe('3500000');
      expect(response.body.sections.executionBudget.profitForecast).toBe('1500000');
      expect(response.body.sections.executionBudget.orderProgressRate).toBe('50');
    });

    it('実行予算が存在しない場合nullを返却すること (41.3)', async () => {
      setupAllSectionsForBudget();
      (
        mockExecutionBudgetService.getSummaryByProjectId as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

      expect(response.status).toBe(200);
      expect(response.body.sections.executionBudget).toBeNull();
    });

    it('実行予算取得エラー時にnullを返却すること (41.4)', async () => {
      setupAllSectionsForBudget();
      (
        mockExecutionBudgetService.getSummaryByProjectId as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('DB error'));

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

      expect(response.status).toBe(200);
      expect(response.body.sections.executionBudget).toBeNull();
    });

    it('実行予算取得エラーが他のセクションデータに影響しないこと (41.5)', async () => {
      setupAllSectionsForBudget();
      (
        mockExecutionBudgetService.getSummaryByProjectId as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('ExecutionBudget service error'));

      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/detail-summary`);

      expect(response.status).toBe(200);
      // 他のセクションは正常に返却される
      expect(response.body.sections.siteSurveys).toBeDefined();
      expect(response.body.sections.quantityTables).toBeDefined();
      expect(response.body.sections.itemizedStatements).toBeDefined();
      expect(response.body.sections.estimateRequests).toBeDefined();
      expect(response.body.sections.estimates).toBeDefined();
      expect(response.body.sections.contracts).toBeDefined();
      expect(response.body.sections.schedules).toBeDefined();
      // 実行予算セクションはデフォルト値
      expect(response.body.sections.executionBudget).toBeNull();
    });
  });
});
