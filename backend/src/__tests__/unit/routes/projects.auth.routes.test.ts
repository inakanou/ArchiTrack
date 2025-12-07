/**
 * @fileoverview プロジェクトAPIルートの認証・認可テスト
 *
 * Requirements:
 * - 12.1: 認証ミドルウェア適用
 * - 12.2: 認可ミドルウェア適用
 * - 12.3: 権限チェック（project:read, project:create, project:update, project:delete）
 *
 * TDD: RED phase - 認証・認可の拒否ケースをテスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

// 認証・認可ミドルウェアのモック関数
const mockAuthenticate = vi.hoisted(() => vi.fn());
const mockRequirePermission = vi.hoisted(() => vi.fn());

// モックサービス
const mockProjectService = vi.hoisted(() => ({
  createProject: vi.fn(),
  getProjects: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getRelatedCounts: vi.fn(),
}));

const mockProjectStatusService = vi.hoisted(() => ({
  transitionStatus: vi.fn(),
  getStatusHistory: vi.fn(),
  getAllowedTransitions: vi.fn(),
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

// モック: 認証ミドルウェア（動的にモック動作を変更可能）
vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    mockAuthenticate(req, res, next);
  },
}));

// モック: 認可ミドルウェア（動的にモック動作を変更可能）
vi.mock('../../../middleware/authorize.middleware', () => ({
  requirePermission: (permission: string) => (req: Request, res: Response, next: NextFunction) => {
    mockRequirePermission(permission)(req, res, next);
  },
}));

// 実際のルートをインポート（モックの後にインポート）
import projectsRouter from '../../../routes/projects.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

describe('Projects Routes - Authentication and Authorization', () => {
  let app: Application;

  const TEST_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/projects', projectsRouter);
    app.use(errorHandler);
  });

  describe('Authentication failures (401 Unauthorized)', () => {
    beforeEach(() => {
      // 認証失敗をシミュレート
      mockAuthenticate.mockImplementation((_req: Request, res: Response, _next: NextFunction) => {
        res.status(401).json({
          type: 'https://httpstatuses.com/401',
          title: 'Unauthorized',
          status: 401,
          detail: 'Authentication required',
          code: 'UNAUTHORIZED',
        });
      });
    });

    it('should return 401 for GET /api/projects without authentication', async () => {
      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for GET /api/projects/:id without authentication', async () => {
      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}`);

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for POST /api/projects without authentication', async () => {
      const response = await request(app).post('/api/projects').send({
        name: 'テストプロジェクト',
        customerName: 'テスト顧客',
        salesPersonId: TEST_PROJECT_ID,
      });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for PUT /api/projects/:id without authentication', async () => {
      const response = await request(app).put(`/api/projects/${TEST_PROJECT_ID}`).send({
        name: '更新プロジェクト',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for DELETE /api/projects/:id without authentication', async () => {
      const response = await request(app).delete(`/api/projects/${TEST_PROJECT_ID}`);

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for PATCH /api/projects/:id/status without authentication', async () => {
      const response = await request(app)
        .patch(`/api/projects/${TEST_PROJECT_ID}/status`)
        .send({ status: 'SURVEYING' });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for GET /api/projects/:id/status-history without authentication', async () => {
      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/status-history`);

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Authorization failures (403 Forbidden)', () => {
    beforeEach(() => {
      // 認証は成功、認可が失敗するシナリオ
      mockAuthenticate.mockImplementation((req: Request, _res: Response, next: NextFunction) => {
        req.user = {
          userId: 'test-user-id',
          email: 'test@example.com',
          roles: ['user'],
        };
        next();
      });

      // 認可失敗をシミュレート
      mockRequirePermission.mockImplementation(
        (_permission: string) => (_req: Request, res: Response, _next: NextFunction) => {
          res.status(403).json({
            type: 'https://httpstatuses.com/403',
            title: 'Forbidden',
            status: 403,
            detail: 'Insufficient permissions',
            code: 'FORBIDDEN',
          });
        }
      );
    });

    it('should return 403 for GET /api/projects without project:read permission', async () => {
      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
      expect(mockRequirePermission).toHaveBeenCalledWith('project:read');
    });

    it('should return 403 for GET /api/projects/:id without project:read permission', async () => {
      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
      expect(mockRequirePermission).toHaveBeenCalledWith('project:read');
    });

    it('should return 403 for POST /api/projects without project:create permission', async () => {
      const response = await request(app).post('/api/projects').send({
        name: 'テストプロジェクト',
        customerName: 'テスト顧客',
        salesPersonId: TEST_PROJECT_ID,
      });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
      expect(mockRequirePermission).toHaveBeenCalledWith('project:create');
    });

    it('should return 403 for PUT /api/projects/:id without project:update permission', async () => {
      const response = await request(app).put(`/api/projects/${TEST_PROJECT_ID}`).send({
        name: '更新プロジェクト',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
      expect(mockRequirePermission).toHaveBeenCalledWith('project:update');
    });

    it('should return 403 for DELETE /api/projects/:id without project:delete permission', async () => {
      const response = await request(app).delete(`/api/projects/${TEST_PROJECT_ID}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
      expect(mockRequirePermission).toHaveBeenCalledWith('project:delete');
    });

    it('should return 403 for PATCH /api/projects/:id/status without project:update permission', async () => {
      const response = await request(app)
        .patch(`/api/projects/${TEST_PROJECT_ID}/status`)
        .send({ status: 'SURVEYING' });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
      expect(mockRequirePermission).toHaveBeenCalledWith('project:update');
    });

    it('should return 403 for GET /api/projects/:id/status-history without project:read permission', async () => {
      const response = await request(app).get(`/api/projects/${TEST_PROJECT_ID}/status-history`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
      expect(mockRequirePermission).toHaveBeenCalledWith('project:read');
    });
  });

  describe('Permission verification', () => {
    beforeEach(() => {
      // 認証成功
      mockAuthenticate.mockImplementation((req: Request, _res: Response, next: NextFunction) => {
        req.user = {
          userId: 'test-user-id',
          email: 'test@example.com',
          roles: ['user'],
        };
        next();
      });

      // 認可成功
      mockRequirePermission.mockImplementation(
        (_permission: string) => (_req: Request, _res: Response, next: NextFunction) => {
          next();
        }
      );
    });

    it('should verify project:read permission is required for GET /api/projects', async () => {
      mockProjectService.getProjects.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      await request(app).get('/api/projects');

      expect(mockRequirePermission).toHaveBeenCalledWith('project:read');
    });

    it('should verify project:read permission is required for GET /api/projects/:id', async () => {
      mockProjectService.getProject.mockResolvedValue({
        id: TEST_PROJECT_ID,
        name: 'テスト',
        status: 'PREPARING',
      });

      await request(app).get(`/api/projects/${TEST_PROJECT_ID}`);

      expect(mockRequirePermission).toHaveBeenCalledWith('project:read');
    });

    it('should verify project:create permission is required for POST /api/projects', async () => {
      mockProjectService.createProject.mockResolvedValue({
        id: TEST_PROJECT_ID,
        name: 'テスト',
        status: 'PREPARING',
      });

      await request(app).post('/api/projects').send({
        name: 'テストプロジェクト',
        customerName: 'テスト顧客',
        salesPersonId: TEST_PROJECT_ID,
      });

      expect(mockRequirePermission).toHaveBeenCalledWith('project:create');
    });

    it('should verify project:update permission is required for PUT /api/projects/:id', async () => {
      mockProjectService.updateProject.mockResolvedValue({
        id: TEST_PROJECT_ID,
        name: '更新プロジェクト',
        status: 'PREPARING',
      });

      await request(app).put(`/api/projects/${TEST_PROJECT_ID}`).send({
        name: '更新プロジェクト',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });

      expect(mockRequirePermission).toHaveBeenCalledWith('project:update');
    });

    it('should verify project:delete permission is required for DELETE /api/projects/:id', async () => {
      mockProjectService.deleteProject.mockResolvedValue(undefined);

      await request(app).delete(`/api/projects/${TEST_PROJECT_ID}`);

      expect(mockRequirePermission).toHaveBeenCalledWith('project:delete');
    });

    it('should verify project:update permission is required for PATCH /api/projects/:id/status', async () => {
      mockProjectStatusService.transitionStatus.mockResolvedValue({
        id: TEST_PROJECT_ID,
        status: 'SURVEYING',
      });

      await request(app)
        .patch(`/api/projects/${TEST_PROJECT_ID}/status`)
        .send({ status: 'SURVEYING' });

      expect(mockRequirePermission).toHaveBeenCalledWith('project:update');
    });

    it('should verify project:read permission is required for GET /api/projects/:id/status-history', async () => {
      mockProjectStatusService.getStatusHistory.mockResolvedValue([]);

      await request(app).get(`/api/projects/${TEST_PROJECT_ID}/status-history`);

      expect(mockRequirePermission).toHaveBeenCalledWith('project:read');
    });
  });

  describe('User context in authenticated requests', () => {
    beforeEach(() => {
      // 認証成功（ユーザーID確認用）
      mockAuthenticate.mockImplementation((req: Request, _res: Response, next: NextFunction) => {
        req.user = {
          userId: 'authenticated-user-id',
          email: 'user@example.com',
          roles: ['project-manager'],
        };
        next();
      });

      // 認可成功
      mockRequirePermission.mockImplementation(
        (_permission: string) => (_req: Request, _res: Response, next: NextFunction) => {
          next();
        }
      );
    });

    it('should pass authenticated user ID to createProject', async () => {
      mockProjectService.createProject.mockResolvedValue({
        id: TEST_PROJECT_ID,
        name: 'テスト',
        status: 'PREPARING',
      });

      await request(app).post('/api/projects').send({
        name: 'テストプロジェクト',
        customerName: 'テスト顧客',
        salesPersonId: TEST_PROJECT_ID,
      });

      expect(mockProjectService.createProject).toHaveBeenCalledWith(
        expect.any(Object),
        'authenticated-user-id'
      );
    });

    it('should pass authenticated user ID to updateProject', async () => {
      mockProjectService.updateProject.mockResolvedValue({
        id: TEST_PROJECT_ID,
        name: '更新プロジェクト',
        status: 'PREPARING',
      });

      await request(app).put(`/api/projects/${TEST_PROJECT_ID}`).send({
        name: '更新プロジェクト',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });

      expect(mockProjectService.updateProject).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        expect.any(Object),
        'authenticated-user-id',
        expect.any(Date)
      );
    });

    it('should pass authenticated user ID to deleteProject', async () => {
      mockProjectService.deleteProject.mockResolvedValue(undefined);

      await request(app).delete(`/api/projects/${TEST_PROJECT_ID}`);

      expect(mockProjectService.deleteProject).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        'authenticated-user-id'
      );
    });

    it('should pass authenticated user ID to transitionStatus', async () => {
      mockProjectStatusService.transitionStatus.mockResolvedValue({
        id: TEST_PROJECT_ID,
        status: 'SURVEYING',
      });

      await request(app)
        .patch(`/api/projects/${TEST_PROJECT_ID}/status`)
        .send({ status: 'SURVEYING' });

      expect(mockProjectStatusService.transitionStatus).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        'SURVEYING',
        'authenticated-user-id',
        undefined
      );
    });
  });
});
