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
  addRolesToUser: vi.fn(),
  removeRoleFromUser: vi.fn(),
  getUserRoles: vi.fn(),
  deleteUser: vi.fn(),
}));

// サービスの構築に渡された引数（権限付与の上限の判定が渡されていることを確かめる。タスク51.1）
const userRoleServiceConstructorArgs = vi.hoisted(() => [] as unknown[][]);

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
    constructor(...args: unknown[]) {
      userRoleServiceConstructorArgs.push(args);
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
  getSharedRBACService: () => ({}),
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

// 異常の検知への送信（要件43.2）
const observeSecurityAnomaly = vi.hoisted(() => vi.fn());
vi.mock('../../../services/security-anomaly-monitor.service.js', () => ({
  observeSecurityAnomaly: (...args: unknown[]) => observeSecurityAnomaly(...args),
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
import { Prisma } from '../../../generated/prisma/client.js';
import { PrivilegeCeilingPolicy } from '../../../services/privilege-ceiling.js';

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

      (mockUserRoleService.addRolesToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
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

      (mockUserRoleService.addRolesToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
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

      (mockUserRoleService.addRolesToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
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
      (mockUserRoleService.addRolesToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
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

      (mockUserRoleService.addRolesToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Ok(undefined)
      );

      const response = await request(app).post(`/api/v1/users/${userId}/roles`).send({ roleIds });

      expect(response.status).toBe(204);
      // 全ロールを1回の呼び出し（一つのトランザクション）で渡し、1件ずつの追加はしない
      expect(mockUserRoleService.addRolesToUser).toHaveBeenCalledTimes(1);
      expect(mockUserRoleService.addRolesToUser).toHaveBeenCalledWith(
        userId,
        roleIds,
        'admin-user-id',
        expect.objectContaining({ email: expect.any(String) })
      );
      expect(mockUserRoleService.addRoleToUser).not.toHaveBeenCalled();
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
      // 監査ログ（USER_ROLE_REVOKED）を削除と同じトランザクションで記録させるため、実行者をサービスへ渡す
      expect(mockUserRoleService.removeRoleFromUser).toHaveBeenCalledWith(
        userId,
        roleId,
        'admin-user-id'
      );
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

  describe('DELETE /api/v1/users/:id', () => {
    it('削除できれば 204 を返す', async () => {
      mockUserRoleService.deleteUser.mockResolvedValue(Ok({ email: 'target@example.com' }));

      const response = await request(app).delete('/api/v1/users/target-user-id');

      expect(response.status).toBe(204);
      expect(mockUserRoleService.deleteUser).toHaveBeenCalledWith(
        'target-user-id',
        'admin-user-id'
      );
    });

    it('ユーザーが存在しなければ 404 USER_NOT_FOUND を返す', async () => {
      mockUserRoleService.deleteUser.mockResolvedValue(Err({ type: 'USER_NOT_FOUND' }));

      const response = await request(app).delete('/api/v1/users/missing-user-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'User not found', code: 'USER_NOT_FOUND' });
    });

    it('最後の管理者は削除できず 400 LAST_ADMIN_PROTECTED を返す', async () => {
      mockUserRoleService.deleteUser.mockResolvedValue(Err({ type: 'LAST_ADMIN_PROTECTED' }));

      const response = await request(app).delete('/api/v1/users/last-admin-id');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Cannot delete the last admin user',
        code: 'LAST_ADMIN_PROTECTED',
      });
    });

    it('自分自身は削除できず 400 CANNOT_DELETE_SELF を返し、削除を呼ばない', async () => {
      // 認証ミドルウェアのモックは userId に admin-user-id を入れる
      const response = await request(app).delete('/api/v1/users/admin-user-id');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Cannot delete yourself',
        code: 'CANNOT_DELETE_SELF',
      });
      expect(mockUserRoleService.deleteUser).not.toHaveBeenCalled();
    });

    it('トランザクションのタイムアウト（Prisma P2028）はエラーハンドラーへ渡り 500 Transaction Timeout になる', async () => {
      mockUserRoleService.deleteUser.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Transaction already closed', {
          code: 'P2028',
          clientVersion: 'test',
        })
      );

      const response = await request(app).delete('/api/v1/users/target-user-id');

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({ status: 500, title: 'Transaction Timeout' });
    });

    it('レコードの不在（Prisma P2025）はエラーハンドラーへ渡り 404 Not Found になる', async () => {
      mockUserRoleService.deleteUser.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record to delete does not exist', {
          code: 'P2025',
          clientVersion: 'test',
        })
      );

      const response = await request(app).delete('/api/v1/users/target-user-id');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ status: 404, title: 'Not Found' });
    });
  });

  describe('権限付与の上限（タスク51.1）', () => {
    it('ユーザー・ロールのサービスへ権限付与の上限の判定を渡して構築する', () => {
      expect(
        userRoleServiceConstructorArgs.some((args) =>
          args.some((arg) => arg instanceof PrivilegeCeilingPolicy)
        )
      ).toBe(true);
    });

    it('実行者の上限を超えるロールの割り当ては 403 FORBIDDEN を返し、code に種別を載せる', async () => {
      (mockUserRoleService.addRolesToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' })
      );

      const response = await request(app)
        .post('/api/v1/users/user-1/roles')
        .send({ roleIds: ['role-high'] });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'FORBIDDEN',
        code: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
      });
      // 権限付与の上限による拒否も権限の拒否として異常の検知へ送る（要件43.2）
      expect(observeSecurityAnomaly).toHaveBeenCalledTimes(1);
      expect(observeSecurityAnomaly).toHaveBeenCalledWith({
        signal: 'permission_denied',
        sourceIp: expect.any(String),
        userId: 'admin-user-id',
      });
    });

    it('システム管理者でない実行者による管理者ロールの割り当ては 403 FORBIDDEN を返す', async () => {
      (mockUserRoleService.addRolesToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'SYSTEM_ADMIN_REQUIRED' })
      );

      const response = await request(app)
        .post('/api/v1/users/user-1/roles')
        .send({ roleIds: ['role-admin'] });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: 'FORBIDDEN', code: 'SYSTEM_ADMIN_REQUIRED' });
      expect(observeSecurityAnomaly).toHaveBeenCalledWith({
        signal: 'permission_denied',
        sourceIp: expect.any(String),
        userId: 'admin-user-id',
      });
    });

    it('上限による拒否でない失敗（404）は異常の検知へ送らない', async () => {
      (mockUserRoleService.addRolesToUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'ROLE_NOT_FOUND' })
      );

      const response = await request(app)
        .post('/api/v1/users/user-1/roles')
        .send({ roleIds: ['role-missing'] });

      expect(response.status).toBe(404);
      expect(observeSecurityAnomaly).not.toHaveBeenCalled();
    });

    it('上限を超えるロールの他の利用者からの解除は 403 FORBIDDEN を返し、異常の検知へ送る（タスク58.1）', async () => {
      (mockUserRoleService.removeRoleFromUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' })
      );

      const response = await request(app).delete('/api/v1/users/user-1/roles/role-high');

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'FORBIDDEN',
        code: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
      });
      expect(mockUserRoleService.removeRoleFromUser).toHaveBeenCalledWith(
        'user-1',
        'role-high',
        'admin-user-id'
      );
      expect(observeSecurityAnomaly).toHaveBeenCalledTimes(1);
      expect(observeSecurityAnomaly).toHaveBeenCalledWith({
        signal: 'permission_denied',
        sourceIp: expect.any(String),
        userId: 'admin-user-id',
      });
    });

    it('最後の管理者の保護（400）による解除の失敗は異常の検知へ送らない', async () => {
      (mockUserRoleService.removeRoleFromUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err({ type: 'LAST_ADMIN_PROTECTED' })
      );

      const response = await request(app).delete('/api/v1/users/user-1/roles/role-admin');

      expect(response.status).toBe(400);
      expect(observeSecurityAnomaly).not.toHaveBeenCalled();
    });
  });
});
