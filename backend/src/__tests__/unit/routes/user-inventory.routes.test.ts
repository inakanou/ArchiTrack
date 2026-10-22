/**
 * @fileoverview 管理者向けの利用者の操作のルーターの検証（タスク47.8・49.2・49.5）
 *
 * - `GET /api/v1/users/inventory` がクエリを検証してサービスへ渡し、不正な値を 400 で返す。
 *   権限 `user:read` を求める
 * - `POST /api/v1/users/:id/2fa/reset` が実行者・対象者・送信元をサービスへ渡し、結果を 204・403・404 に写す
 * - `POST /api/v1/users/:id/deactivate`・`/reactivate` が理由を検証してサービスへ渡し、結果を
 *   204・400・404・409 に写す
 * - `user:manage` の権限を求める
 * - app.ts で user-roles.routes.ts より前にマウントする（`/:id` 系の経路に固定の経路を拾わせない）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const mocks = vi.hoisted(() => ({
  resetByAdmin: vi.fn(),
  deactivate: vi.fn(),
  reactivate: vi.fn(),
  inventoryList: vi.fn(),
  requiredPermissions: [] as string[],
}));

vi.mock('../../../db', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/two-factor.service', () => ({
  TwoFactorService: class {
    resetByAdmin = mocks.resetByAdmin;
  },
}));

vi.mock('../../../services/account-status.service', () => ({
  AccountStatusService: class {
    deactivate = mocks.deactivate;
    reactivate = mocks.reactivate;
  },
}));

vi.mock('../../../services/user-inventory.service', () => ({
  UserInventoryService: class {
    list = mocks.inventoryList;
  },
}));

vi.mock('../../../services/admin-notification.service', () => ({
  AdminNotificationService: class {},
}));

vi.mock('../../../services/email.service', () => ({
  EmailService: class {},
}));

vi.mock('../../../services/authenticated-user-state.service', () => ({
  getSharedAuthenticatedUserStateService: () => ({ invalidate: vi.fn() }),
}));

vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId: 'admin-1', email: 'admin@example.com', roles: ['admin'] };
    next();
  },
}));

vi.mock('../../../middleware/authorize.middleware', () => ({
  requirePermission: (permission: string) => {
    mocks.requiredPermissions.push(permission);
    return (_req: Request, _res: Response, next: NextFunction) => next();
  },
}));

import userInventoryRouter from '../../../routes/user-inventory.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

describe('管理者向けの利用者の操作のルーター', () => {
  let app: Application;

  beforeEach(() => {
    mocks.resetByAdmin.mockReset();
    mocks.deactivate.mockReset();
    mocks.reactivate.mockReset();
    mocks.inventoryList.mockReset();
    app = express();
    app.use(express.json());
    app.use('/api/v1/users', userInventoryRouter);
    app.use(errorHandler);
  });

  describe('GET /api/v1/users/inventory', () => {
    const emptyPage = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };

    /**
     * @requirement user-authentication/REQ-36.10
     */
    it('既定のページでサービスを呼び、一覧とページ情報を返す', async () => {
      mocks.inventoryList.mockResolvedValue(emptyPage);

      const response = await request(app).get('/api/v1/users/inventory');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(emptyPage);
      expect(mocks.inventoryList).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });

    /**
     * @requirement user-authentication/REQ-36.11
     */
    it('状態と経過日数を組み合わせて数値に直して渡す', async () => {
      mocks.inventoryList.mockResolvedValue(emptyPage);

      const response = await request(app).get(
        '/api/v1/users/inventory?status=inactive&inactiveDaysAtLeast=90&page=2&limit=100'
      );

      expect(response.status).toBe(200);
      expect(mocks.inventoryList).toHaveBeenCalledWith({
        status: 'inactive',
        inactiveDaysAtLeast: 90,
        page: 2,
        limit: 100,
      });
    });

    it.each([
      'status=locked',
      'inactiveDaysAtLeast=-1',
      'inactiveDaysAtLeast=1.5',
      'inactiveDaysAtLeast=abc',
      'inactiveDaysAtLeast=36501',
      'page=0',
      'limit=0',
      'limit=101',
    ])('不正なクエリ %s を 400 VALIDATION_ERROR で返しサービスを呼ばない', async (query) => {
      const response = await request(app).get(`/api/v1/users/inventory?${query}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(mocks.inventoryList).not.toHaveBeenCalled();
    });

    it('サービスの失敗をエラーハンドラーへ渡す', async () => {
      mocks.inventoryList.mockRejectedValue(new Error('db down'));

      const response = await request(app).get('/api/v1/users/inventory');

      expect(response.status).toBe(500);
    });

    /**
     * @requirement user-authentication/REQ-36.12
     */
    it('権限 user:read を求める', () => {
      expect(mocks.requiredPermissions).toContain('user:read');
    });
  });

  describe('POST /api/v1/users/:id/2fa/reset', () => {
    /**
     * @requirement user-authentication/REQ-34.7
     */
    it('実行者・対象者・送信元をサービスへ渡し、成功で 204 を返す', async () => {
      mocks.resetByAdmin.mockResolvedValue({ ok: true, value: undefined });

      const response = await request(app)
        .post('/api/v1/users/target-1/2fa/reset')
        .set('User-Agent', 'vitest-agent');

      expect(response.status).toBe(204);
      expect(mocks.resetByAdmin).toHaveBeenCalledWith(
        'admin-1',
        'target-1',
        expect.objectContaining({ userAgent: 'vitest-agent' })
      );
    });

    /**
     * @requirement user-authentication/REQ-34.9
     */
    it('自分自身の再設定を 403 SELF_RESET_FORBIDDEN で返す', async () => {
      mocks.resetByAdmin.mockResolvedValue({
        ok: false,
        error: { type: 'SELF_RESET_FORBIDDEN' },
      });

      const response = await request(app).post('/api/v1/users/admin-1/2fa/reset');

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('SELF_RESET_FORBIDDEN');
    });

    it('対象者の不在を 404 USER_NOT_FOUND で返す', async () => {
      mocks.resetByAdmin.mockResolvedValue({ ok: false, error: { type: 'USER_NOT_FOUND' } });

      const response = await request(app).post('/api/v1/users/missing/2fa/reset');

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('USER_NOT_FOUND');
    });

    it('権限 user:manage を求める', () => {
      expect(mocks.requiredPermissions).toContain('user:manage');
    });
  });

  describe.each([
    ['deactivate', mocks.deactivate],
    ['reactivate', mocks.reactivate],
  ] as const)('POST /api/v1/users/:id/%s', (operation, serviceMethod) => {
    /**
     * @requirement user-authentication/REQ-36.1
     * @requirement user-authentication/REQ-36.3
     */
    it('実行者・対象者・理由・送信元をサービスへ渡し、成功で 204 を返す', async () => {
      serviceMethod.mockResolvedValue({ ok: true, value: undefined });

      const response = await request(app)
        .post(`/api/v1/users/target-1/${operation}`)
        .set('User-Agent', 'vitest-agent')
        .send({ reason: '  退職のため  ' });

      expect(response.status).toBe(204);
      expect(serviceMethod).toHaveBeenCalledWith(
        'admin-1',
        'target-1',
        '退職のため',
        expect.objectContaining({ userAgent: 'vitest-agent' })
      );
    });

    it.each([[{}], [{ reason: '' }], [{ reason: '   ' }], [{ reason: 42 }]])(
      '理由の欠落を 400 で返しサービスを呼ばない（本文 %j）',
      async (body) => {
        const response = await request(app).post(`/api/v1/users/target-1/${operation}`).send(body);

        expect(response.status).toBe(400);
        expect(serviceMethod).not.toHaveBeenCalled();
      }
    );

    it('対象者の不在を 404 USER_NOT_FOUND で返す', async () => {
      serviceMethod.mockResolvedValue({ ok: false, error: { type: 'USER_NOT_FOUND' } });

      const response = await request(app)
        .post(`/api/v1/users/missing/${operation}`)
        .send({ reason: '理由' });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('USER_NOT_FOUND');
    });

    /**
     * @requirement user-authentication/REQ-36.5
     */
    it.each(['SELF_DEACTIVATION_FORBIDDEN', 'LAST_ACTIVE_ADMIN_PROTECTED', 'ALREADY_IN_STATE'])(
      '%s を 409 で返す',
      async (type) => {
        serviceMethod.mockResolvedValue({ ok: false, error: { type } });

        const response = await request(app)
          .post(`/api/v1/users/target-1/${operation}`)
          .send({ reason: '理由' });

        expect(response.status).toBe(409);
        expect(response.body.code).toBe(type);
      }
    );
  });

  it('2FA の再設定・無効化・再有効化の 3 経路がそれぞれ権限 user:manage を求める', () => {
    expect(mocks.requiredPermissions.filter((p) => p === 'user:manage')).toHaveLength(3);
  });

  it('app.ts は user-roles.routes.ts より前に /api/v1/users へマウントする', () => {
    const appSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../app.ts'),
      'utf-8'
    );
    const inventoryMount = appSource.indexOf("app.use('/api/v1/users', userInventoryRoutes)");
    const userRolesMount = appSource.indexOf("app.use('/api/v1/users', userRolesRoutes)");

    expect(inventoryMount).toBeGreaterThan(-1);
    expect(userRolesMount).toBeGreaterThan(inventoryMount);
  });
});
