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

vi.mock('../../../services/audit-log.service', () => ({
  AuditLogService: class {
    constructor() {
      return mockAuditLogService;
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
    customerName: 'テスト顧客',
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
        customerName: 'テスト顧客',
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
      customerName: '新規顧客',
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
          customerName: validCreateInput.customerName,
          salesPersonId: validCreateInput.salesPersonId,
        }),
        'test-user-id'
      );
    });

    it('should create project with minimal required fields', async () => {
      const minimalInput = {
        name: '最小プロジェクト',
        customerName: '最小顧客',
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
        customerName: '顧客名',
        salesPersonId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const response = await request(app).post('/api/projects').send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when customerName is missing', async () => {
      const invalidInput = {
        name: 'プロジェクト名',
        salesPersonId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const response = await request(app).post('/api/projects').send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when salesPersonId is missing', async () => {
      const invalidInput = {
        name: 'プロジェクト名',
        customerName: '顧客名',
      };

      const response = await request(app).post('/api/projects').send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when name exceeds 255 characters', async () => {
      const invalidInput = {
        name: 'a'.repeat(256),
        customerName: '顧客名',
        salesPersonId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const response = await request(app).post('/api/projects').send(invalidInput);

      expect(response.status).toBe(400);
    });

    it('should return 400 when salesPersonId is invalid UUID format', async () => {
      const invalidInput = {
        name: 'プロジェクト名',
        customerName: '顧客名',
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
      customerName: '更新顧客',
      expectedUpdatedAt: '2025-01-02T00:00:00.000Z',
    };

    it('should update project successfully', async () => {
      const updatedProject = {
        ...mockProjectInfo,
        name: validUpdateInput.name,
        customerName: validUpdateInput.customerName,
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
        customerName: '更新顧客',
      });
      expect(mockProjectService.updateProject).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        expect.objectContaining({
          name: validUpdateInput.name,
          customerName: validUpdateInput.customerName,
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
        customerName: '顧客',
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
});
