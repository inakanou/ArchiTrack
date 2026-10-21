/**
 * @fileoverview 管理者向けの利用者の操作のルーターの検証（タスク47.8）
 *
 * - `POST /api/v1/users/:id/2fa/reset` が実行者・対象者・送信元をサービスへ渡し、結果を 204・403・404 に写す
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
    app = express();
    app.use(express.json());
    app.use('/api/v1/users', userInventoryRouter);
    app.use(errorHandler);
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
