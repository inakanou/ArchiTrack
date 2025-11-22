/**
 * @fileoverview ロールルートのテスト
 *
 * Requirements:
 * - 17: 動的ロール管理
 * - 19: ロールへの権限割り当て
 *
 * TDD: RED phase - テストを先に作成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { Ok, Err } from '../../../types/result.js';

// モックサービスをvi.hoisted()で初期化
const mockRoleService = vi.hoisted(() => ({
  listRoles: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  getRoleById: vi.fn(),
}));

const mockRolePermissionService = vi.hoisted(() => ({
  addPermissionToRole: vi.fn(),
  removePermissionFromRole: vi.fn(),
  getRolePermissions: vi.fn(),
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
vi.mock('../../../services/role.service', () => ({
  RoleService: class {
    constructor() {
      return mockRoleService;
    }
  },
}));

vi.mock('../../../services/role-permission.service', () => ({
  RolePermissionService: class {
    constructor() {
      return mockRolePermissionService;
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
import rolesRouter from '../../../routes/roles.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

describe('Role Routes', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/v1/roles', rolesRouter);
    app.use(errorHandler);
  });

  describe('GET /api/v1/roles', () => {
    it('should return list of roles', async () => {
      const mockRoles = [
        {
          id: 'role-1',
          name: 'System Administrator',
          description: 'Full system access',
          priority: 100,
          isSystem: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { userRoles: 1, rolePermissions: 10 },
        },
        {
          id: 'role-2',
          name: 'General User',
          description: 'Basic user access',
          priority: 0,
          isSystem: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { userRoles: 5, rolePermissions: 3 },
        },
      ];

      (mockRoleService.listRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);

      const response = await request(app).get('/api/v1/roles');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({
        id: 'role-1',
        name: 'System Administrator',
      });
    });

    it('should return empty array when no roles exist', async () => {
      (mockRoleService.listRoles as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const response = await request(app).get('/api/v1/roles');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('POST /api/v1/roles', () => {
    it('should create a new role successfully', async () => {
      const newRole = {
        name: 'Project Manager',
        description: 'Manages projects',
        priority: 50,
      };

      const createdRole = {
        id: 'role-3',
        ...newRole,
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockRoleService.createRole as ReturnType<typeof vi.fn>).mockResolvedValue(Ok(createdRole));

      const response = await request(app).post('/api/v1/roles').send(newRole);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: 'role-3',
        name: 'Project Manager',
      });
    });

    it('should return 400 when required fields are missing', async () => {
      const invalidRole = {
        description: 'Missing name',
      };

      const response = await request(app).post('/api/v1/roles').send(invalidRole);

      expect(response.status).toBe(400);
      expect(response.body.type).toBe('https://api.architrack.com/errors/validation-error');
      expect(response.body.detail).toBeDefined();
    });

    it('should return 409 when role name already exists', async () => {
      const duplicateRole = {
        name: 'System Administrator',
        description: 'Duplicate',
      };

      (mockRoleService.createRole as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'ROLE_NAME_CONFLICT', name: 'System Administrator' })
      );

      const response = await request(app).post('/api/v1/roles').send(duplicateRole);

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('PATCH /api/v1/roles/:id', () => {
    it('should update role successfully', async () => {
      const roleId = 'role-3';
      const updateData = {
        description: 'Updated description',
        priority: 60,
      };

      const updatedRole = {
        id: roleId,
        name: 'Project Manager',
        description: 'Updated description',
        priority: 60,
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockRoleService.updateRole as ReturnType<typeof vi.fn>).mockResolvedValue(Ok(updatedRole));

      const response = await request(app).patch(`/api/v1/roles/${roleId}`).send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.description).toBe('Updated description');
      expect(response.body.priority).toBe(60);
    });

    it('should return 404 when role not found', async () => {
      const roleId = 'non-existent-role';
      const updateData = { description: 'Updated' };

      (mockRoleService.updateRole as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'ROLE_NOT_FOUND' })
      );

      const response = await request(app).patch(`/api/v1/roles/${roleId}`).send(updateData);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 409 when new name conflicts', async () => {
      const roleId = 'role-3';
      const updateData = { name: 'System Administrator' };

      (mockRoleService.updateRole as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'ROLE_NAME_CONFLICT', name: 'System Administrator' })
      );

      const response = await request(app).patch(`/api/v1/roles/${roleId}`).send(updateData);

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('DELETE /api/v1/roles/:id', () => {
    it('should delete role successfully', async () => {
      const roleId = 'role-3';

      (mockRoleService.deleteRole as ReturnType<typeof vi.fn>).mockResolvedValue(Ok(undefined));

      const response = await request(app).delete(`/api/v1/roles/${roleId}`);

      expect(response.status).toBe(204);
    });

    it('should return 404 when role not found', async () => {
      const roleId = 'non-existent-role';

      (mockRoleService.deleteRole as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'ROLE_NOT_FOUND' })
      );

      const response = await request(app).delete(`/api/v1/roles/${roleId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 400 when role is in use', async () => {
      const roleId = 'role-1';

      (mockRoleService.deleteRole as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'ROLE_IN_USE', assignedCount: 5 })
      );

      const response = await request(app).delete(`/api/v1/roles/${roleId}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('in use');
    });

    it('should return 400 when trying to delete system role', async () => {
      const roleId = 'role-1';

      (mockRoleService.deleteRole as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'SYSTEM_ROLE_PROTECTED' })
      );

      const response = await request(app).delete(`/api/v1/roles/${roleId}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('system role');
    });
  });

  describe('POST /api/v1/roles/:id/permissions', () => {
    it('should add permission to role successfully', async () => {
      const roleId = 'role-3';
      const permissionId = 'permission-1';

      (mockRolePermissionService.addPermissionToRole as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(undefined)
      );

      const response = await request(app)
        .post(`/api/v1/roles/${roleId}/permissions`)
        .send({ permissionId });

      expect(response.status).toBe(204);
    });

    it('should return 400 when permissionId is missing', async () => {
      const roleId = 'role-3';

      const response = await request(app).post(`/api/v1/roles/${roleId}/permissions`).send({});

      expect(response.status).toBe(400);
      expect(response.body.type).toBe('https://api.architrack.com/errors/validation-error');
      expect(response.body.detail).toBeDefined();
    });

    it('should return 404 when role not found', async () => {
      const roleId = 'non-existent-role';
      const permissionId = 'permission-1';

      (mockRolePermissionService.addPermissionToRole as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'ROLE_NOT_FOUND' })
      );

      const response = await request(app)
        .post(`/api/v1/roles/${roleId}/permissions`)
        .send({ permissionId });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 404 when permission not found', async () => {
      const roleId = 'role-3';
      const permissionId = 'non-existent-permission';

      (mockRolePermissionService.addPermissionToRole as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'PERMISSION_NOT_FOUND' })
      );

      const response = await request(app)
        .post(`/api/v1/roles/${roleId}/permissions`)
        .send({ permissionId });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('DELETE /api/v1/roles/:id/permissions/:permissionId', () => {
    it('should remove permission from role successfully', async () => {
      const roleId = 'role-3';
      const permissionId = 'permission-1';

      (
        mockRolePermissionService.removePermissionFromRole as ReturnType<typeof vi.fn>
      ).mockResolvedValue(Ok(undefined));

      const response = await request(app).delete(
        `/api/v1/roles/${roleId}/permissions/${permissionId}`
      );

      expect(response.status).toBe(204);
    });

    it('should return 404 when role not found', async () => {
      const roleId = 'non-existent-role';
      const permissionId = 'permission-1';

      (
        mockRolePermissionService.removePermissionFromRole as ReturnType<typeof vi.fn>
      ).mockResolvedValue(Err({ type: 'ROLE_NOT_FOUND' }));

      const response = await request(app).delete(
        `/api/v1/roles/${roleId}/permissions/${permissionId}`
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 400 when trying to remove protected permission', async () => {
      const roleId = 'system-admin-role';
      const permissionId = 'all-permissions';

      (
        mockRolePermissionService.removePermissionFromRole as ReturnType<typeof vi.fn>
      ).mockResolvedValue(Err({ type: 'ADMIN_WILDCARD_PROTECTED' }));

      const response = await request(app).delete(
        `/api/v1/roles/${roleId}/permissions/${permissionId}`
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('admin wildcard permission');
    });
  });
});
