/**
 * @fileoverview POST /api/v1/auth/password/reset-request の制限と応答の検証（タスク48.2）
 *
 * Requirements (user-authentication):
 * - 7.3: リセットトークンは 1 時間で無効
 * - 35.4: 送信元・メールアドレスごとの制限の超過で要求を受け付けず、メールを送らない
 * - 35.7: 受理しない要求にも登録の有無を推測できない応答を返す
 *
 * 本物の制限（本番の判定・メモリの記録）を本番と同じ掛け方で掛け、本物の認証ルーターと
 * PasswordService を通す。DB とメールの投入はモックし、メールの投入の回数で送信の有無を見る。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

const sendPasswordResetEmail = vi.hoisted(() => vi.fn());

const REGISTERED_EMAIL = 'registered@example.com';
const REGISTERED_USER_ID = 'user-registered';

const tx = vi.hoisted(() => ({
  passwordResetToken: { create: vi.fn(), deleteMany: vi.fn() },
}));

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  passwordResetToken: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../../../db', () => ({
  default: vi.fn(() => mockPrisma),
}));

vi.mock('../../../redis.js', () => ({
  default: { getClient: vi.fn(() => null) },
}));

vi.mock('../../../services/auth.service', () => ({
  AuthService: class {},
}));

vi.mock('../../../services/two-factor.service', () => ({
  TwoFactorService: class {},
}));

vi.mock('../../../services/email.service', () => ({
  EmailService: class {
    sendPasswordResetEmail = sendPasswordResetEmail;
  },
}));

vi.mock('../../../services/audit-log.service', () => ({
  AuditLogService: class {
    createLog = vi.fn().mockResolvedValue({ id: 'audit-1' });
  },
}));

import authRouter from '../../../routes/auth.routes.js';
import { createRuntimeMode } from '../../../config/runtime-mode.js';
import {
  AUTH_RATE_LIMITS,
  createRateLimiters,
  mountAuthRateLimitPolicy,
} from '../../../middleware/rateLimit.middleware.js';
import { SESSION_CONFIG } from '../../../config/security.constants.js';

const LIMIT = AUTH_RATE_LIMITS.PASSWORD_RESET_REQUEST.limit;
const ACCEPTED = {
  status: 200,
  body: { message: 'If an account exists, a password reset email has been sent' },
};

/** 本番の判定で組み立てた制限と本物の認証ルーター（中継 1 段を信頼する） */
function buildApp(nodeEnv: 'production' | 'test' = 'production'): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.log = { warn: vi.fn(), info: vi.fn() } as unknown as Request['log'];
    next();
  });
  mountAuthRateLimitPolicy(
    app,
    createRateLimiters({
      runtimeMode: createRuntimeMode({ NODE_ENV: nodeEnv }),
      getRedisClient: () => null,
    })
  );
  app.use('/api/v1/auth', authRouter);
  return app;
}

let ipSeq = 0;
/** 要求ごとに別の送信元から送る（送信元ごとの制限に掛からないようにする） */
async function resetRequest(app: Express, email: string, ip = `203.0.113.${++ipSeq % 250}`) {
  const res = await request(app)
    .post('/api/v1/auth/password/reset-request')
    .set('X-Forwarded-For', ip)
    .send({ email });
  return { status: res.status, body: res.body as unknown, headers: res.headers };
}

describe('POST /api/v1/auth/password/reset-request の制限と応答（タスク48.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipSeq = 0;
    mockPrisma.user.findUnique.mockImplementation(({ where }: { where: { email: string } }) =>
      Promise.resolve(
        where.email === REGISTERED_EMAIL
          ? { id: REGISTERED_USER_ID, email: REGISTERED_EMAIL }
          : null
      )
    );
    mockPrisma.$transaction.mockImplementation((callback: (client: unknown) => Promise<unknown>) =>
      callback(tx)
    );
    tx.passwordResetToken.create.mockResolvedValue({ id: 'reset-token-1' });
    tx.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    sendPasswordResetEmail.mockResolvedValue(undefined);
  });

  /**
   * @requirement user-authentication/REQ-35.4
   * @requirement user-authentication/REQ-35.7
   */
  it('未登録・正常・メールアドレスの制限の超過のいずれも同じ応答を返し、超過ではメールを送らない', async () => {
    const app = buildApp();

    const unregistered = await resetRequest(app, 'nobody@example.com');
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();

    const normal: Awaited<ReturnType<typeof resetRequest>>[] = [];
    for (let i = 0; i < LIMIT; i++) {
      normal.push(await resetRequest(app, REGISTERED_EMAIL));
    }
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(LIMIT);
    expect(tx.passwordResetToken.create).toHaveBeenCalledTimes(LIMIT);

    const limited = await resetRequest(app, REGISTERED_EMAIL);

    for (const res of [unregistered, ...normal, limited]) {
      expect({ status: res.status, body: res.body }).toEqual(ACCEPTED);
      expect(res.headers['retry-after']).toBeUndefined();
      expect(res.headers['ratelimit-remaining']).toBe(String(LIMIT - 1));
    }
    // 超過した要求は処理しない（メールもトークンも作らない）
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(LIMIT);
    expect(tx.passwordResetToken.create).toHaveBeenCalledTimes(LIMIT);
  });

  /**
   * @requirement user-authentication/REQ-35.4
   * @requirement user-authentication/REQ-35.7
   */
  it('未登録のメールアドレスの制限の超過も同じ応答を返す', async () => {
    const app = buildApp();

    const responses: Awaited<ReturnType<typeof resetRequest>>[] = [];
    for (let i = 0; i < LIMIT + 1; i++) {
      responses.push(await resetRequest(app, 'nobody@example.com'));
    }

    for (const res of responses) {
      expect({ status: res.status, body: res.body }).toEqual(ACCEPTED);
    }
    // 超過した 6 回目は利用者の検索まで届かない
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(LIMIT);
  });

  /**
   * @requirement user-authentication/REQ-35.4
   */
  it('同じ送信元からの上限の超過は 429 を返し、メールを送らない', async () => {
    const app = buildApp();

    for (let i = 0; i < LIMIT; i++) {
      await resetRequest(app, `registered+${i}@example.com`, '198.51.100.7');
    }
    const res = await resetRequest(app, REGISTERED_EMAIL, '198.51.100.7');

    expect(res.status).toBe(429);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(LIMIT);
  });

  /**
   * @requirement user-authentication/REQ-7.3
   */
  it('受理した要求は 1 時間で切れるトークンを作り、同じ利用者の未使用のトークンを失効させる', async () => {
    const app = buildApp();
    const before = Date.now();

    await resetRequest(app, REGISTERED_EMAIL);

    const { expiresAt } = tx.passwordResetToken.create.mock.calls[0]![0].data as {
      expiresAt: Date;
    };
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + SESSION_CONFIG.PASSWORD_RESET_TOKEN_EXPIRY_MS
    );
    expect(expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + SESSION_CONFIG.PASSWORD_RESET_TOKEN_EXPIRY_MS
    );
    expect(tx.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: REGISTERED_USER_ID, usedAt: null },
    });
  });

  it('試験の実行環境では上限を超えても要求を処理する（E2E の前提）', async () => {
    const app = buildApp('test');

    for (let i = 0; i < LIMIT + 1; i++) {
      await resetRequest(app, REGISTERED_EMAIL, '192.0.2.1');
    }

    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(LIMIT + 1);
  });

  it('メールアドレスの形式の誤りは制限より後ろの検証で 400 を返す', async () => {
    const app = buildApp();

    const res = await resetRequest(app, 'not-an-email');

    expect(res.status).toBe(400);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
