/**
 * @fileoverview POST /api/v1/auth/2fa/disable（2FA の自己の無効化）の拒否のルート検証
 *
 * 2FA は全ユーザーで必須のため、利用者自身による無効化の要求は 403 で拒否する（要件34.6）。
 * 本物の errorHandler を通し、拒否が Problem Details で返ること、要求の本文（パスワード）の
 * 有無に関わらず拒否し、2FA の状態を読み書きしないことを確かめる。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

/** TwoFactorService の全メソッドの呼び出しの記録（拒否の経路がサービスへ届かないことの確認用） */
const twoFactorServiceCalls = vi.hoisted(() => [] as string[]);

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  twoFactorBackupCode: { deleteMany: vi.fn() },
  refreshToken: { deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../../../db', () => ({
  default: vi.fn(() => mockPrisma),
}));

vi.mock('../../../services/auth.service', () => ({
  AuthService: class {},
}));

vi.mock('../../../services/two-factor.service', () => ({
  TwoFactorService: class {
    constructor() {
      return new Proxy(
        {},
        {
          get: (_target, property) => {
            if (typeof property !== 'string' || property === 'then') {
              return undefined;
            }
            return (..._args: unknown[]) => {
              twoFactorServiceCalls.push(property);
              return Promise.resolve({ ok: true, value: undefined });
            };
          },
        }
      );
    }
  },
}));

vi.mock('../../../services/password.service', () => ({
  PasswordService: class {},
}));

vi.mock('../../../middleware/rateLimit.middleware', () => ({
  loginLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  refreshLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer valid-access-token') {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }
    req.user = { userId: 'user-1', email: 'user@example.com', roles: ['user'] };
    next();
  },
}));

import authRouter from '../../../routes/auth.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

describe('POST /api/v1/auth/2fa/disable（2FA の自己の無効化の拒否）', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    twoFactorServiceCalls.length = 0;
    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', authRouter);
    app.use(errorHandler);
  });

  /**
   * @requirement user-authentication/REQ-34.6
   */
  it('正しいパスワードを添えた自己の無効化の要求を 403 TWO_FACTOR_DISABLE_NOT_ALLOWED の Problem Details で拒否する', async () => {
    const response = await request(app)
      .post('/api/v1/auth/2fa/disable')
      .set('Authorization', 'Bearer valid-access-token')
      .send({ password: 'Current!Pass-2026' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      type: 'https://api.architrack.com/errors/forbidden',
      title: 'TWO_FACTOR_DISABLE_NOT_ALLOWED',
      status: 403,
      detail: 'Disabling two-factor authentication is not allowed',
      instance: '/api/v1/auth/2fa/disable',
      code: 'TWO_FACTOR_DISABLE_NOT_ALLOWED',
      message: 'Disabling two-factor authentication is not allowed',
    });
  });

  /**
   * @requirement user-authentication/REQ-34.6
   */
  it('本文の無い要求も検証の誤り（400）ではなく 403 で拒否する', async () => {
    const response = await request(app)
      .post('/api/v1/auth/2fa/disable')
      .set('Authorization', 'Bearer valid-access-token');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('TWO_FACTOR_DISABLE_NOT_ALLOWED');
  });

  /**
   * @requirement user-authentication/REQ-34.6
   */
  it('拒否した要求は 2FA の状態を読み書きしない（サービスにも DB にも届かない）', async () => {
    await request(app)
      .post('/api/v1/auth/2fa/disable')
      .set('Authorization', 'Bearer valid-access-token')
      .send({ password: 'Current!Pass-2026' });

    expect(twoFactorServiceCalls).toEqual([]);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.twoFactorBackupCode.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('認証されていない要求は 403 より先に 401 で拒否する', async () => {
    const response = await request(app)
      .post('/api/v1/auth/2fa/disable')
      .send({ password: 'Current!Pass-2026' });

    expect(response.status).toBe(401);
    expect(twoFactorServiceCalls).toEqual([]);
  });
});
