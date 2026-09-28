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
  addPermissionsToRole: vi.fn(),
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
  getSharedRBACService: () => ({}),
}));

vi.mock('../../../services/audit-log.service', () => ({
  AuditLogService: class {
    constructor() {
      return {
        createLog: vi.fn().mockResolvedValue(undefined),
      };
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

    describe('楽観的ロック（expectedUpdatedAt）', () => {
      const roleId = 'role-3';
      const expected = '2026-09-27T01:00:00.000Z';
      const actual = '2026-09-27T01:00:05.000Z';
      const role = {
        id: roleId,
        name: 'Project Manager',
        description: 'Updated',
        priority: 0,
        isSystem: false,
        createdAt: new Date(expected),
        updatedAt: new Date(actual),
      };

      /**
       * @requirement user-authentication/REQ-25.8
       */
      it('版を送らない更新は従来どおり版なしでサービスへ渡る', async () => {
        vi.mocked(mockRoleService.updateRole).mockResolvedValue(Ok(role));

        const response = await request(app)
          .patch(`/api/v1/roles/${roleId}`)
          .send({ description: 'Updated' });

        expect(response.status).toBe(200);
        expect(mockRoleService.updateRole).toHaveBeenCalledWith(roleId, {
          name: undefined,
          description: 'Updated',
          priority: undefined,
        });
      });

      /**
       * @requirement user-authentication/REQ-25.8
       */
      it('送られた版は日時としてサービスへ渡り、応答は新しい版を返す', async () => {
        vi.mocked(mockRoleService.updateRole).mockResolvedValue(Ok(role));

        const response = await request(app)
          .patch(`/api/v1/roles/${roleId}`)
          .send({ description: 'Updated', expectedUpdatedAt: expected });

        expect(response.status).toBe(200);
        expect(response.body.updatedAt).toBe(actual);
        expect(mockRoleService.updateRole).toHaveBeenCalledWith(roleId, {
          name: undefined,
          description: 'Updated',
          priority: undefined,
          expectedUpdatedAt: new Date(expected),
        });
      });

      /**
       * @requirement user-authentication/REQ-25.8
       */
      it('版が古いときは 409 と Problem Details（ROLE_CONFLICT、期待と実際の版）を返す', async () => {
        vi.mocked(mockRoleService.updateRole).mockResolvedValue(
          Err({
            type: 'ROLE_CONFLICT',
            expectedUpdatedAt: new Date(expected),
            actualUpdatedAt: new Date(actual),
          })
        );

        const response = await request(app)
          .patch(`/api/v1/roles/${roleId}`)
          .send({ description: 'Updated', expectedUpdatedAt: expected });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
          type: 'https://api.architrack.com/errors/conflict',
          title: 'ROLE_CONFLICT',
          status: 409,
          detail: '他のユーザーによって更新されました。画面を更新してください',
          instance: `/api/v1/roles/${roleId}`,
          code: 'ROLE_CONFLICT',
          message: '他のユーザーによって更新されました。画面を更新してください',
          details: { expectedUpdatedAt: expected, actualUpdatedAt: actual },
        });
      });

      /**
       * @requirement user-authentication/REQ-25.8
       */
      it('版を送ってもロールが無ければ 409 ではなく 404 を返す', async () => {
        vi.mocked(mockRoleService.updateRole).mockResolvedValue(Err({ type: 'ROLE_NOT_FOUND' }));

        const response = await request(app)
          .patch(`/api/v1/roles/${roleId}`)
          .send({ description: 'Updated', expectedUpdatedAt: expected });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'Role not found', code: 'ROLE_NOT_FOUND' });
      });

      /**
       * @requirement user-authentication/REQ-25.8
       */
      it('日時でない版は 400 で拒否し、サービスを呼ばない', async () => {
        const response = await request(app)
          .patch(`/api/v1/roles/${roleId}`)
          .send({ description: 'Updated', expectedUpdatedAt: 'not-a-date' });

        expect(response.status).toBe(400);
        expect(mockRoleService.updateRole).not.toHaveBeenCalled();
      });
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

      (
        mockRolePermissionService.addPermissionsToRole as ReturnType<typeof vi.fn>
      ).mockResolvedValue(Ok(undefined));

      const response = await request(app)
        .post(`/api/v1/roles/${roleId}/permissions`)
        .send({ permissionId });

      expect(response.status).toBe(204);
      // 単一指定も一括の経路（一つのトランザクション）へ渡し、実行者を監査ログ用に添える
      expect(mockRolePermissionService.addPermissionsToRole).toHaveBeenCalledWith(
        roleId,
        [permissionId],
        'admin-user-id'
      );
    });

    it('should add multiple permissions in one transactional call', async () => {
      const roleId = 'role-3';
      const permissionIds = ['permission-1', 'permission-2'];

      (
        mockRolePermissionService.addPermissionsToRole as ReturnType<typeof vi.fn>
      ).mockResolvedValue(Ok(undefined));

      const response = await request(app)
        .post(`/api/v1/roles/${roleId}/permissions`)
        .send({ permissionIds });

      expect(response.status).toBe(204);
      expect(mockRolePermissionService.addPermissionsToRole).toHaveBeenCalledTimes(1);
      expect(mockRolePermissionService.addPermissionsToRole).toHaveBeenCalledWith(
        roleId,
        permissionIds,
        'admin-user-id'
      );
      expect(mockRolePermissionService.addPermissionToRole).not.toHaveBeenCalled();
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

      (
        mockRolePermissionService.addPermissionsToRole as ReturnType<typeof vi.fn>
      ).mockResolvedValue(Err({ type: 'ROLE_NOT_FOUND' }));

      const response = await request(app)
        .post(`/api/v1/roles/${roleId}/permissions`)
        .send({ permissionId });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 404 when permission not found', async () => {
      const roleId = 'role-3';
      const permissionId = 'non-existent-permission';

      (
        mockRolePermissionService.addPermissionsToRole as ReturnType<typeof vi.fn>
      ).mockResolvedValue(Err({ type: 'PERMISSION_NOT_FOUND' }));

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
      // 削除の監査ログのため実行者を渡す
      expect(mockRolePermissionService.removePermissionFromRole).toHaveBeenCalledWith(
        roleId,
        permissionId,
        'admin-user-id'
      );
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
