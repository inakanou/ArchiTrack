/**
 * @fileoverview 認証系の試行制限の統合検証（user-authentication タスク48.3）
 *
 * Requirements (user-authentication):
 * - REQ-35.1: 送信元の識別は信頼する中継が付けた値だけで決まる
 * - REQ-35.3: 2FA の検証の制限
 * - REQ-35.4: リセットの要求の送信元・メールアドレスごとの制限
 * - REQ-35.5: リセットの実行と招待経由の登録の制限
 * - REQ-35.6: 本番で無効化の設定を無視する
 *
 * E2E の試験環境は制限を外すため、制限の振る舞いはここで確かめる。
 * 本物の認証・招待のルーターを試験用のアプリへ載せ、その前に
 * `createRateLimiters` へ本番の実行環境の判定と実 Redis を注入して組み立てた制限を
 * `mountAuthRateLimitPolicy` で掛ける（app.ts と同じ掛け方・同じ `configureTrustProxy`）。
 * 中継の段数は 1（画面の配信元の nginx を一段だけ信頼する構成）。
 *
 * Redis は他の統合検証・E2E のバックエンドと共有するため、全消去はせず、
 * この検証だけが使う送信元（TEST-NET-1 の 192.0.2.0/24）とメールアドレスの鍵だけを消す。
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createHash } from 'crypto';
import type Redis from 'ioredis';
import type { PrismaClient } from '../../generated/prisma/client.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { createRuntimeMode } from '../../config/runtime-mode.js';
import { configureTrustProxy } from '../../middleware/client-ip.js';
import { httpLogger } from '../../middleware/logger.middleware.js';
import logger from '../../utils/logger.js';
import { errorHandler, notFoundHandler } from '../../middleware/errorHandler.middleware.js';
import {
  AUTH_RATE_LIMITS,
  createRateLimiters,
  mountAuthRateLimitPolicy,
} from '../../middleware/rateLimit.middleware.js';
import authRoutes from '../../routes/auth.routes.js';
import { createInvitationRoutes } from '../../routes/invitation.routes.js';
import { EmailService } from '../../services/email.service.js';
import { PASSWORD_RESET_REQUEST_ACCEPTED_RESPONSE } from '../../config/security.constants.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua483-rate-limit';

/** 信頼する中継の段数（app.ts と同じ configureTrustProxy に与える） */
const TRUST_PROXY_HOPS = 1;

/** 制限ごとの送信元（信頼する中継が付けた値）。検証の間で数え方が混ざらないよう分ける */
const IP = {
  twoFactor: '192.0.2.31',
  passwordReset: '192.0.2.32',
  registration: '192.0.2.33',
  resetRequestByIp: '192.0.2.34',
  spoofTwoFactor: '192.0.2.35',
  spoofResetRequest: '192.0.2.36',
  developmentBypass: '192.0.2.37',
} as const;
/** メールアドレスごとの制限で、送信元ごとの制限に掛からないよう 1 回ずつ使う送信元 */
const EMAIL_LIMIT_IPS = Array.from({ length: 7 }, (_, i) => `192.0.2.${41 + i}`);
/** 利用者が X-Forwarded-For の先頭に足す偽の送信元 */
const SPOOFED_IPS = Array.from({ length: 11 }, (_, i) => `192.0.2.${101 + i}`);

const PREFIXES = [
  'rl:2fa-verify:',
  'rl:password-reset:',
  'rl:registration:',
  'rl:password-reset-request-ip:',
  'rl:password-reset-request-email:',
] as const;

const REGISTERED_EMAIL = `${MARK}-registered@example.com`;
const UNREGISTERED_EMAILS = Array.from(
  { length: 12 },
  (_, i) => `${MARK}-unregistered-${i}@example.com`
);

/** RateLimitPolicy と同じ鍵（前後の空白を除き小文字にしたメールアドレスの SHA-256） */
const emailHash = (email: string): string =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

/** 信頼する中継（段数 1）が末尾に付けた形の X-Forwarded-For */
const forwardedFor = (trusted: string, spoofed?: string): string =>
  spoofed ? `${spoofed}, ${trusted}` : trusted;

/**
 * 本物の認証・招待のルーターに、与えた実行環境の判定で組み立てた制限を掛けたアプリ
 */
function buildApp(prisma: PrismaClient, runtimeSource: NodeJS.ProcessEnv): Express {
  const limiters = createRateLimiters({
    runtimeMode: createRuntimeMode(runtimeSource),
    getRedisClient: () => redis.getClient(),
  });
  const testApp = express();
  configureTrustProxy(testApp, TRUST_PROXY_HOPS);
  testApp.use(httpLogger);
  // 試験では httpLogger が何もしない差し替え（vitest.setup.ts）のため、pino-http が付ける req.log を補う
  testApp.use((req: Request, _res: Response, next: NextFunction) => {
    req.log ??= logger.child({}) as unknown as Request['log'];
    next();
  });
  testApp.use(express.json());
  testApp.use(cookieParser());
  mountAuthRateLimitPolicy(testApp, limiters);
  testApp.use('/api/v1/auth', authRoutes);
  testApp.use('/api/v1/invitations', createInvitationRoutes(prisma));
  testApp.use(notFoundHandler);
  testApp.use(errorHandler);
  return testApp;
}

describe('認証系の試行制限（統合・本番の実行環境の判定・実 Redis・TRUST_PROXY_HOPS=1）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  let productionApp: Express;
  let registeredUserId: string;

  function allKeys(): string[] {
    const ips = [...Object.values(IP), ...EMAIL_LIMIT_IPS, ...SPOOFED_IPS];
    const emails = [REGISTERED_EMAIL, ...UNREGISTERED_EMAILS].map(emailHash);
    return PREFIXES.flatMap((prefix) => [...ips, ...emails].map((key) => `${prefix}${key}`));
  }

  async function cleanup(): Promise<void> {
    if (redisClient) {
      await redisClient.del(...allKeys());
    }
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await deleteAuditLogsWithArchivePermission(prisma, { actorId: { in: userIds } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（できなければ制限はメモリへ退避し、ここでの観測にならないため赤にする）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');
    redisClient = client!;

    await cleanup();

    const user = await createTestUser(prisma, {
      email: REGISTERED_EMAIL,
      displayName: MARK,
      passwordHash: 'not-used',
    });
    registeredUserId = user.id;

    // 本番の判定。無効化の変数を明示しても読まれないことを同時に確かめる（35.6）
    productionApp = buildApp(prisma, { NODE_ENV: 'production', DISABLE_RATE_LIMIT: 'true' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
  });

  /** 鍵の記録（実 Redis に数えられていることの確認） */
  async function hits(prefix: (typeof PREFIXES)[number], key: string): Promise<number> {
    return Number(await redisClient.get(`${prefix}${key}`));
  }

  /**
   * @requirement user-authentication/REQ-35.3: TOTP とバックアップコードの検証を同じ送信元から合わせて上限を超えて送ると 429 になる
   * @requirement user-authentication/REQ-35.6: 本番の判定では DISABLE_RATE_LIMIT=true を与えても 2FA の検証の制限が外れない
   */
  it('2FA の検証（TOTP・バックアップコード）は送信元ごとに上限を超えると 429 になる（35.3、35.6）', async () => {
    const limit = AUTH_RATE_LIMITS.TWO_FACTOR_VERIFY.limit;
    for (let i = 0; i < limit; i++) {
      const response =
        i % 2 === 0
          ? await request(productionApp)
              .post('/api/v1/auth/verify-2fa')
              .set('X-Forwarded-For', forwardedFor(IP.twoFactor))
              .send({ challengeToken: 'invalid', code: '000000' })
          : await request(productionApp)
              .post('/api/v1/auth/verify-2fa/backup')
              .set('X-Forwarded-For', forwardedFor(IP.twoFactor))
              .send({ challengeToken: 'invalid', backupCode: 'invalid' });
      expect(response.status, `${i + 1} 回目は上限内`).not.toBe(429);
    }

    for (const path of ['/api/v1/auth/verify-2fa', '/api/v1/auth/verify-2fa/backup']) {
      const exceeded = await request(productionApp)
        .post(path)
        .set('X-Forwarded-For', forwardedFor(IP.twoFactor))
        .send({ challengeToken: 'invalid', code: '000000', backupCode: 'invalid' });
      expect(exceeded.status, path).toBe(429);
      expect(exceeded.body.error).toBe(
        'Too many two-factor verification attempts, please try again later.'
      );
    }
    expect(await hits('rl:2fa-verify:', IP.twoFactor)).toBe(limit + 2);
  });

  /**
   * @requirement user-authentication/REQ-35.5: パスワードリセットの実行とトークンの検証を同じ送信元から合わせて上限を超えて送ると 429 になる
   */
  it('パスワードリセットの実行と検証は送信元ごとに上限を超えると 429 になる（35.5）', async () => {
    const limit = AUTH_RATE_LIMITS.PASSWORD_RESET.limit;
    for (let i = 0; i < limit; i++) {
      const response =
        i % 2 === 0
          ? await request(productionApp)
              .post('/api/v1/auth/password/reset')
              .set('X-Forwarded-For', forwardedFor(IP.passwordReset))
              .send({ token: 'invalid', newPassword: 'invalid' })
          : await request(productionApp)
              .get('/api/v1/auth/password/verify-reset')
              .query({ token: 'invalid' })
              .set('X-Forwarded-For', forwardedFor(IP.passwordReset));
      expect(response.status, `${i + 1} 回目は上限内`).not.toBe(429);
    }

    const exceededReset = await request(productionApp)
      .post('/api/v1/auth/password/reset')
      .set('X-Forwarded-For', forwardedFor(IP.passwordReset))
      .send({ token: 'invalid', newPassword: 'invalid' });
    expect(exceededReset.status).toBe(429);
    expect(exceededReset.body.error).toBe(
      'Too many password reset attempts, please try again later.'
    );
    const exceededVerify = await request(productionApp)
      .get('/api/v1/auth/password/verify-reset')
      .query({ token: 'invalid' })
      .set('X-Forwarded-For', forwardedFor(IP.passwordReset));
    expect(exceededVerify.status).toBe(429);
    expect(await hits('rl:password-reset:', IP.passwordReset)).toBe(limit + 2);
  });

  /**
   * @requirement user-authentication/REQ-35.5: 招待経由の登録と招待の検証を同じ送信元から合わせて上限を超えて送ると 429 になる
   */
  it('招待経由の登録と招待の検証は送信元ごとに上限を超えると 429 になる（35.5）', async () => {
    const limit = AUTH_RATE_LIMITS.REGISTRATION.limit;
    for (let i = 0; i < limit; i++) {
      const response =
        i % 2 === 0
          ? await request(productionApp)
              .post('/api/v1/auth/register')
              .set('X-Forwarded-For', forwardedFor(IP.registration))
              .send({})
          : await request(productionApp)
              .get('/api/v1/invitations/verify')
              .query({ token: 'invalid' })
              .set('X-Forwarded-For', forwardedFor(IP.registration));
      expect(response.status, `${i + 1} 回目は上限内`).not.toBe(429);
    }

    const exceededRegister = await request(productionApp)
      .post('/api/v1/auth/register')
      .set('X-Forwarded-For', forwardedFor(IP.registration))
      .send({});
    expect(exceededRegister.status).toBe(429);
    expect(exceededRegister.body.error).toBe(
      'Too many registration attempts, please try again later.'
    );
    const exceededVerify = await request(productionApp)
      .get('/api/v1/invitations/verify')
      .query({ token: 'invalid' })
      .set('X-Forwarded-For', forwardedFor(IP.registration));
    expect(exceededVerify.status).toBe(429);
    expect(await hits('rl:registration:', IP.registration)).toBe(limit + 2);
  });

  /**
   * @requirement user-authentication/REQ-35.4: 同じ送信元からのリセットの要求は上限を超えると 429 で受け付けられず、登録済みのメールアドレスでもリセットのメールを送らない
   */
  it('リセットの要求は送信元ごとに上限を超えると 429 になり、メールを送らない（35.4）', async () => {
    const send = vi.spyOn(EmailService.prototype, 'sendPasswordResetEmail').mockResolvedValue();
    const limit = AUTH_RATE_LIMITS.PASSWORD_RESET_REQUEST.limit;
    for (let i = 0; i < limit; i++) {
      const response = await request(productionApp)
        .post('/api/v1/auth/password/reset-request')
        .set('X-Forwarded-For', forwardedFor(IP.resetRequestByIp))
        .send({ email: UNREGISTERED_EMAILS[i] });
      expect(response.status, `${i + 1} 回目は上限内`).toBe(200);
    }

    // 上限を超えた要求は登録済みのメールアドレスでも処理されない
    const exceeded = await request(productionApp)
      .post('/api/v1/auth/password/reset-request')
      .set('X-Forwarded-For', forwardedFor(IP.resetRequestByIp))
      .send({ email: REGISTERED_EMAIL });
    expect(exceeded.status).toBe(429);
    expect(exceeded.body.error).toBe('Too many password reset requests, please try again later.');
    expect(send).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count({ where: { userId: registeredUserId } })).toBe(0);
    expect(await hits('rl:password-reset-request-ip:', IP.resetRequestByIp)).toBe(limit + 1);
  });

  /**
   * @requirement user-authentication/REQ-35.4: 同じメールアドレスへのリセットの要求は送信元を変えても上限を超えるとメールを送らず、応答は通常の受理と同じ 200 のまま
   */
  it('リセットの要求はメールアドレスごとに上限を超えるとメールを送らず、応答は通常と同じ（35.4）', async () => {
    const send = vi.spyOn(EmailService.prototype, 'sendPasswordResetEmail').mockResolvedValue();
    const limit = AUTH_RATE_LIMITS.PASSWORD_RESET_REQUEST.limit;
    const accepted: request.Response[] = [];
    for (let i = 0; i < limit; i++) {
      const response = await request(productionApp)
        .post('/api/v1/auth/password/reset-request')
        .set('X-Forwarded-For', forwardedFor(EMAIL_LIMIT_IPS[i]!))
        .send({ email: REGISTERED_EMAIL });
      expect(response.status, `${i + 1} 回目は上限内`).toBe(200);
      accepted.push(response);
    }
    expect(send).toHaveBeenCalledTimes(limit);
    const lastToken = send.mock.calls[limit - 1]![1];

    const exceeded = await request(productionApp)
      .post('/api/v1/auth/password/reset-request')
      .set('X-Forwarded-For', forwardedFor(EMAIL_LIMIT_IPS[limit]!))
      .send({ email: REGISTERED_EMAIL });

    // 応答は通常の受理と同じ（状態・本文。メールアドレスごとの残り回数のヘッダーも出さない）
    expect(exceeded.status).toBe(200);
    expect(exceeded.body).toEqual(PASSWORD_RESET_REQUEST_ACCEPTED_RESPONSE);
    expect(exceeded.body).toEqual(accepted[0]!.body);
    // 初めての送信元どうしなので、送信元ごとの残り回数のヘッダーも同じになる
    expect(exceeded.headers['ratelimit-remaining']).toBe(
      accepted[0]!.headers['ratelimit-remaining']
    );
    // メールは送られず、新しいトークンも作られない（最後の受理のトークンが残る）
    expect(send).toHaveBeenCalledTimes(limit);
    const tokens = await prisma.passwordResetToken.findMany({
      where: { userId: registeredUserId, usedAt: null },
    });
    expect(tokens.map((t) => t.token)).toEqual([lastToken]);
    expect(await hits('rl:password-reset-request-email:', emailHash(REGISTERED_EMAIL))).toBe(
      limit + 1
    );
  });

  /**
   * @requirement user-authentication/REQ-35.1: X-Forwarded-For の先頭を要求ごとに偽っても、2FA の検証の制限は信頼する中継が付けた送信元で数え、上限で 429 になる
   */
  it('X-Forwarded-For の先頭を偽っても 2FA の検証の制限の識別は変わらず 429 になる（35.1）', async () => {
    const limit = AUTH_RATE_LIMITS.TWO_FACTOR_VERIFY.limit;
    const statuses: number[] = [];
    for (const spoofed of SPOOFED_IPS.slice(0, limit + 1)) {
      const response = await request(productionApp)
        .post('/api/v1/auth/verify-2fa')
        .set('X-Forwarded-For', forwardedFor(IP.spoofTwoFactor, spoofed))
        .set('X-Real-IP', spoofed)
        .send({ challengeToken: 'invalid', code: '000000' });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, limit)).not.toContain(429);
    expect(statuses[limit]).toBe(429);
    expect(await hits('rl:2fa-verify:', IP.spoofTwoFactor)).toBe(limit + 1);
    for (const spoofed of SPOOFED_IPS) {
      expect(await redisClient.exists(`rl:2fa-verify:${spoofed}`)).toBe(0);
    }
  });

  /**
   * @requirement user-authentication/REQ-35.1: X-Forwarded-For の先頭を要求ごとに偽っても、リセットの要求の送信元ごとの制限の識別は変わらない
   */
  it('X-Forwarded-For の先頭を偽ってもリセットの要求の送信元ごとの制限の識別は変わらない（35.1）', async () => {
    vi.spyOn(EmailService.prototype, 'sendPasswordResetEmail').mockResolvedValue();
    const limit = AUTH_RATE_LIMITS.PASSWORD_RESET_REQUEST.limit;
    const statuses: number[] = [];
    for (let i = 0; i <= limit; i++) {
      const response = await request(productionApp)
        .post('/api/v1/auth/password/reset-request')
        .set('X-Forwarded-For', forwardedFor(IP.spoofResetRequest, SPOOFED_IPS[i]))
        .set('X-Real-IP', SPOOFED_IPS[i]!)
        .send({ email: UNREGISTERED_EMAILS[limit + i] });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([...Array<number>(limit).fill(200), 429]);
    expect(await hits('rl:password-reset-request-ip:', IP.spoofResetRequest)).toBe(limit + 1);
    for (const spoofed of SPOOFED_IPS) {
      expect(await redisClient.exists(`rl:password-reset-request-ip:${spoofed}`)).toBe(0);
    }
  });

  /**
   * @requirement user-authentication/REQ-35.6: 同じ組み立てで、開発の明示の DISABLE_RATE_LIMIT=true なら制限が外れる（本番の 429 は無効化の変数を読まないことによる）
   */
  it('対照: 開発で無効化を明示した判定では同じ要求が 429 にならない（35.6）', async () => {
    const developmentApp = buildApp(prisma, {
      NODE_ENV: 'development',
      DISABLE_RATE_LIMIT: 'true',
    });
    const limit = AUTH_RATE_LIMITS.TWO_FACTOR_VERIFY.limit;
    for (let i = 0; i <= limit; i++) {
      const response = await request(developmentApp)
        .post('/api/v1/auth/verify-2fa')
        .set('X-Forwarded-For', forwardedFor(IP.developmentBypass))
        .send({ challengeToken: 'invalid', code: '000000' });
      expect(response.status, `${i + 1} 回目`).not.toBe(429);
    }
    // 制限を外したので記録もしない
    expect(await redisClient.exists(`rl:2fa-verify:${IP.developmentBypass}`)).toBe(0);
  });
});
