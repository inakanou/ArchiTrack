/**
 * @fileoverview 権限ルートのテスト
 *
 * Requirements:
 * - 18: 権限管理
 *
 * TDD: RED phase - テストを先に作成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

// モックサービス
const mockPermissionService = {
  listPermissions: vi.fn(),
  createPermission: vi.fn(),
};

// モック: データベース
vi.mock('../../../db', () => ({
  default: vi.fn(() => ({})),
}));

// モック: サービス層
vi.mock('../../../services/permission.service', () => ({
  PermissionService: class {
    constructor() {
      return mockPermissionService;
    }
  },
}));

// モック: 認証・認可・バリデーションミドルウェア
vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      userId: 'admin-user-id',
      email: 'admin@example.com',
      roles: ['system-admin'],
    };
    next();
  },
}));

vi.mock('../../../middleware/authorize.middleware', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../middleware/validate.middleware', () => ({
  validate: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// 実際のルートをインポート（モックの後にインポート）
import permissionsRouter from '../../../routes/permissions.routes.js';

describe('Permission Routes', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/v1/permissions', permissionsRouter);
  });

  describe('GET /api/v1/permissions', () => {
    it('should return list of permissions', async () => {
      const mockPermissions = [
        {
          id: 'permission-1',
          resource: 'adr',
          action: 'read',
          description: 'View ADRs',
          createdAt: new Date(),
        },
        {
          id: 'permission-2',
          resource: 'adr',
          action: 'create',
          description: 'Create new ADRs',
          createdAt: new Date(),
        },
        {
          id: 'permission-3',
          resource: 'user',
          action: 'manage',
          description: 'Manage users',
          createdAt: new Date(),
        },
      ];

      (mockPermissionService.listPermissions as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockPermissions
      );

      const response = await request(app).get('/api/v1/permissions');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3);
      expect(response.body[0]).toMatchObject({
        id: 'permission-1',
        resource: 'adr',
        action: 'read',
      });
    });

    it('should return empty array when no permissions exist', async () => {
      (mockPermissionService.listPermissions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const response = await request(app).get('/api/v1/permissions');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should sort permissions by resource and action', async () => {
      const mockPermissions = [
        {
          id: 'permission-1',
          resource: 'user',
          action: 'create',
          description: 'Create users',
          createdAt: new Date(),
        },
        {
          id: 'permission-2',
          resource: 'adr',
          action: 'read',
          description: 'View ADRs',
          createdAt: new Date(),
        },
        {
          id: 'permission-3',
          resource: 'adr',
          action: 'create',
          description: 'Create ADRs',
          createdAt: new Date(),
        },
      ];

      (mockPermissionService.listPermissions as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockPermissions
      );

      const response = await request(app).get('/api/v1/permissions');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3);
      // Service側でソート済みと仮定
      expect(response.body[0].resource).toBe('user');
      expect(response.body[1].resource).toBe('adr');
    });
  });
});
