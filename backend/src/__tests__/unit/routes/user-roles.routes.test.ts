/**
 * @fileoverview ユーザーロールルートのテスト
 *
 * Requirements:
 * - 20: ユーザーへのロール割り当て（マルチロール対応）
 *
 * TDD: RED phase - テストを先に作成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { Ok, Err } from '../../../types/result.js';

// モックサービスをvi.hoisted()で初期化
const mockUserRoleService = vi.hoisted(() => ({
  addRoleToUser: vi.fn(),
  removeRoleFromUser: vi.fn(),
  getUserRoles: vi.fn(),
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
vi.mock('../../../services/user-role.service', () => ({
  UserRoleService: class {
    constructor() {
      return mockUserRoleService;
    }
  },
}));

vi.mock('../../../services/rbac.service', () => ({
  RBACService: class {
    constructor() {
      return {};
    }
  },
}));

vi.mock('../../../services/audit-log.service', () => ({
  AuditLogService: class {
    constructor() {
      return {};
    }
  },
}));

vi.mock('../../../services/email.service', () => ({
  EmailService: class {
    constructor() {
      return {};
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

// 実際のルートとミドルウェアをインポート（モックの後にインポート）
import userRolesRouter from '../../../routes/user-roles.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

describe('User Role Routes', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/v1/users', userRolesRouter);
    app.use(errorHandler);
  });

  describe('POST /api/v1/users/:id/roles', () => {
    it('should add role to user successfully', async () => {
      const userId = 'user-1';
      const roleId = 'role-2';

      (mockUserRoleService.addRoleToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(undefined)
      );

      const response = await request(app)
        .post(`/api/v1/users/${userId}/roles`)
        .send({ roleIds: [roleId] });

      expect(response.status).toBe(204);
    });

    it('should return 400 when roleIds is missing', async () => {
      const userId = 'user-1';

      const response = await request(app).post(`/api/v1/users/${userId}/roles`).send({});

      expect(response.status).toBe(400);
      expect(response.body.type).toBe('https://api.architrack.com/errors/validation-error');
      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when roleIds is empty array', async () => {
      const userId = 'user-1';

      const response = await request(app)
        .post(`/api/v1/users/${userId}/roles`)
        .send({ roleIds: [] });

      expect(response.status).toBe(400);
    });

    it('should return 404 when user not found', async () => {
      const userId = 'non-existent-user';
      const roleId = 'role-2';

      (mockUserRoleService.addRoleToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'USER_NOT_FOUND' })
      );

      const response = await request(app)
        .post(`/api/v1/users/${userId}/roles`)
        .send({ roleIds: [roleId] });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 404 when role not found', async () => {
      const userId = 'user-1';
      const roleId = 'non-existent-role';

      (mockUserRoleService.addRoleToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'ROLE_NOT_FOUND' })
      );

      const response = await request(app)
        .post(`/api/v1/users/${userId}/roles`)
        .send({ roleIds: [roleId] });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should handle duplicate role assignment gracefully', async () => {
      const userId = 'user-1';
      const roleId = 'role-2';

      // サービス層で重複を無視（Ok(undefined)を返す）
      (mockUserRoleService.addRoleToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(undefined)
      );

      const response = await request(app)
        .post(`/api/v1/users/${userId}/roles`)
        .send({ roleIds: [roleId] });

      expect(response.status).toBe(204);
    });

    it('should add multiple roles at once', async () => {
      const userId = 'user-1';
      const roleIds = ['role-1', 'role-2', 'role-3'];

      (mockUserRoleService.addRoleToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(undefined)
      );

      const response = await request(app).post(`/api/v1/users/${userId}/roles`).send({ roleIds });

      expect(response.status).toBe(204);
      expect(mockUserRoleService.addRoleToUser).toHaveBeenCalledTimes(3);
    });
  });

  describe('DELETE /api/v1/users/:id/roles/:roleId', () => {
    it('should remove role from user successfully', async () => {
      const userId = 'user-1';
      const roleId = 'role-2';

      (mockUserRoleService.removeRoleFromUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(undefined)
      );

      const response = await request(app).delete(`/api/v1/users/${userId}/roles/${roleId}`);

      expect(response.status).toBe(204);
    });

    it('should return 404 when user not found', async () => {
      const userId = 'non-existent-user';
      const roleId = 'role-2';

      (mockUserRoleService.removeRoleFromUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'USER_NOT_FOUND' })
      );

      const response = await request(app).delete(`/api/v1/users/${userId}/roles/${roleId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 404 when role assignment not found', async () => {
      const userId = 'user-1';
      const roleId = 'role-2';

      (mockUserRoleService.removeRoleFromUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'ASSIGNMENT_NOT_FOUND' })
      );

      const response = await request(app).delete(`/api/v1/users/${userId}/roles/${roleId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 400 when trying to remove last admin role', async () => {
      const userId = 'last-admin';
      const roleId = 'system-admin-role';

      (mockUserRoleService.removeRoleFromUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'LAST_ADMIN_PROTECTED' })
      );

      const response = await request(app).delete(`/api/v1/users/${userId}/roles/${roleId}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('last admin');
    });
  });
});
