/**
 * @fileoverview 認証（ログイン・2FA の検証）の DB 障害の応答とエラー監視の検証（user-authentication タスク55.3）
 *
 * Requirements (user-authentication):
 * - REQ-42.4: 想定外のエラーをエラー監視サービスへ送信するとき、要求本文、Cookie、認証ヘッダーの機密値を送信しない
 * - REQ-42.8: 認証処理中にデータベースの障害が発生したとき、障害の詳細を応答に含めず、汎用のエラーメッセージを返す
 *
 * 本物の auth.routes・errorHandler・sentry.ts の captureException を通し、AuthService が DATABASE_ERROR を
 * 返したときの応答と、Sentry.captureException へ渡る文脈を確かめる。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { Err } from '../../../types/result.js';

const mockAuthService = vi.hoisted(() => ({
  login: vi.fn(),
  completeTwoFactorLogin: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: vi.fn(() => 'mocked-profiling-integration'),
}));

vi.mock('../../../db', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/auth.service', () => ({
  AuthService: class {
    constructor() {
      return mockAuthService;
    }
  },
}));

vi.mock('../../../services/two-factor.service', () => ({
  TwoFactorService: class {},
}));

vi.mock('../../../services/password.service', () => ({
  PasswordService: class {},
}));

vi.mock('../../../middleware/rateLimit.middleware', () => ({
  loginLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  refreshLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import authRouter from '../../../routes/auth.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

/** Prisma が返しうる、内部の構成を含む障害の文言 */
const DB_FAILURE_MESSAGE =
  'Invalid `prisma.user.findUnique()` invocation: Can\'t reach database server at `db.internal:5432` (table "users")';

const REQUEST_ID = '11111111-2222-4333-8444-555555555555';

/** 要求本文に載る機密（パスワード・コード・2FA 待ちの資格） */
const PASSWORD = 'Password-Secret-123!';
const TOTP_CODE = '482913';
const BACKUP_CODE = 'BACKUP-SECRET-CODE';
const CHALLENGE_TOKEN = 'challenge-token-secret-value';

const cases = [
  {
    label: 'ログイン',
    path: '/api/v1/auth/login',
    body: { email: 'user@example.com', password: PASSWORD },
    secrets: [PASSWORD],
  },
  {
    label: '2FA の検証（TOTP）',
    path: '/api/v1/auth/verify-2fa',
    body: { challengeToken: CHALLENGE_TOKEN, code: TOTP_CODE },
    secrets: [TOTP_CODE, CHALLENGE_TOKEN],
  },
  {
    label: '2FA の検証（バックアップコード）',
    path: '/api/v1/auth/verify-2fa/backup',
    body: { challengeToken: CHALLENGE_TOKEN, backupCode: BACKUP_CODE },
    secrets: [BACKUP_CODE, CHALLENGE_TOKEN],
  },
];

describe('認証の DB 障害の応答とエラー監視', () => {
  let app: Application;
  let originalDsn: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { id: string }).id = REQUEST_ID;
      next();
    });
    app.use('/api/v1/auth', authRouter);
    app.use(errorHandler);
    const dbFailure = Err({ type: 'DATABASE_ERROR', message: DB_FAILURE_MESSAGE });
    mockAuthService.login.mockResolvedValue(dbFailure);
    mockAuthService.completeTwoFactorLogin.mockResolvedValue(dbFailure);
  });

  afterEach(() => {
    if (originalDsn === undefined) {
      delete process.env.SENTRY_DSN;
    } else {
      process.env.SENTRY_DSN = originalDsn;
    }
  });

  /**
   * @requirement user-authentication/REQ-42.8
   */
  it.each(cases)(
    '$label: 障害の詳細を応答に含めず、汎用のエラーメッセージを 500 で返す',
    async ({ path, body }) => {
      const response = await request(app).post(path).send(body);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
      const raw = JSON.stringify(response.body);
      expect(raw).not.toContain('prisma');
      expect(raw).not.toContain('db.internal');
      expect(raw).not.toContain('users');
      expect(raw).not.toContain('DATABASE_ERROR');
    }
  );

  /**
   * @requirement user-authentication/REQ-42.4
   */
  it.each(cases)(
    '$label: 障害をエラー監視へ一度だけ送り、文脈は経路・メソッド・要求識別子に限り要求本文の機密を含めない',
    async ({ path, body, secrets }) => {
      await request(app)
        .post(path)
        .set('Authorization', 'Bearer header-secret')
        .set('Cookie', 'refreshToken=cookie-secret')
        .send(body);

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      const [error, hint] = vi.mocked(Sentry.captureException).mock.calls[0] as [
        Error,
        { extra: Record<string, unknown> },
      ];
      expect(error.message).toBe(DB_FAILURE_MESSAGE);
      expect(hint.extra).toEqual({
        route: path,
        method: 'POST',
        requestId: REQUEST_ID,
        userId: undefined,
        errorType: 'auth_database_error',
      });
      const serialized = JSON.stringify(hint);
      for (const secret of [...secrets, 'header-secret', 'cookie-secret']) {
        expect(serialized).not.toContain(secret);
      }
    }
  );
});
