/**
 * @fileoverview 管理者による 2FA の再設定より前に発行されたアクセストークンの拒否の統合検証
 * （user-authentication タスク47.11）
 *
 * Requirements (user-authentication):
 * - REQ-34.7: 管理者による 2FA の再設定より前に発行されたアクセストークンによる以後の要求を拒否する
 *
 * モックを使わず、本物のアプリ（認証ミドルウェア・ルート・エラーハンドラー）と実 PostgreSQL・実 Redis を通す。
 * - 再設定は利用者のアクセストークンの世代（`access_token_generation`）を 1 つ進める
 * - 再設定より前のアクセストークン（発行時の世代 `gen` が小さいもの）は、状態のキャッシュの TTL を待たずに、
 *   2FA の設定・有効化を含む全ての要求で、署名の不正なトークンと同じ 401 になる
 * - 再設定の直後（同じ秒を含む）にログインし直したトークンは拒否せず、2FA 未登録として扱う
 * - `gen` を持たない既存のトークンは世代 0 として扱い、世代 0 の利用者で通る
 */

import { randomBytes, randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import * as jose from 'jose';
import type { CryptoKey } from 'jose';
import type Redis from 'ioredis';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import tokenService from '../../services/token.service.js';
import { DEFAULT_JWT_AUDIENCE, DEFAULT_JWT_ISSUER } from '../../config/jwt-claims.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';
import { authUserStateCacheKey } from '../../services/authenticated-user-state-cache.js';
import { loginForTokens } from './auth-login-client.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-47-11-access-token-generation';
const PASSWORD = 'AccessTokenGeneration!Passphrase-2026';

/** 署名の不正なトークンと同じ 401 の本文とヘッダー（認証ミドルウェアの既存の応答） */
const INVALID_TOKEN_BODY = { error: 'INVALID_TOKEN', message: 'Invalid or expired token' };
const INVALID_TOKEN_HEADER = 'Bearer realm="ArchiTrack", error="invalid_token"';

describe('管理者による 2FA の再設定より前のアクセストークンの拒否（統合）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  let passwordHash: string;
  let signingKey: CryptoKey;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await redisClient.del(...ids.map(authUserStateCacheKey));
    }
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }],
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.twoFactorBackupCode.deleteMany({ where: { userId: { in: ids } } });
    await prisma.passwordHistory.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  async function clearRateLimits(): Promise<void> {
    const keys = await redisClient.keys('rl:*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  }

  function newEmail(label: string): string {
    return `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`;
  }

  /** ロールを割り当てた利用者を作る（既定は 2FA 登録済み） */
  async function createUserWithRole(email: string, roleName: 'admin' | 'user') {
    const user = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-user`,
      passwordHash,
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user;
  }

  function bearer(accessToken: string): [string, string] {
    return ['Authorization', `Bearer ${accessToken}`];
  }

  /** 管理者の API で対象者の 2FA を再設定する */
  async function resetTwoFactor(targetId: string): Promise<void> {
    const admin = await createUserWithRole(newEmail('admin'), 'admin');
    const adminToken = await tokenService.generateAccessToken({
      userId: admin.id,
      email: admin.email,
      roles: ['admin'],
      accessTokenGeneration: 0,
    });
    const reset = await request(app)
      .post(`/api/v1/users/${targetId}/2fa/reset`)
      .set(...bearer(adminToken));
    expect(reset.status).toBe(204);
  }

  /**
   * 本番と同じ鍵とクレームで、世代と発行時刻を指定したアクセストークンを作る
   * （`gen` を省くと世代の導入より前の形のトークンになる）
   */
  async function signAccessToken(
    user: { id: string; email: string },
    options: { gen?: number; iatSeconds?: number }
  ): Promise<string> {
    const iat = options.iatSeconds ?? Math.floor(Date.now() / 1000);
    return new jose.SignJWT({
      userId: user.id,
      email: user.email,
      roles: ['user'],
      token_use: 'access',
      ...(options.gen !== undefined && { gen: options.gen }),
    })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'at+jwt' })
      .setSubject(user.id)
      .setIssuer(process.env.JWT_ISSUER || DEFAULT_JWT_ISSUER)
      .setAudience(process.env.JWT_AUDIENCE || DEFAULT_JWT_AUDIENCE)
      .setJti(randomUUID())
      .setIssuedAt(iat)
      .setExpirationTime(iat + 15 * 60)
      .sign(signingKey);
  }

  /** 署名の不正な 401 と同じ応答か */
  function expectInvalidTokenResponse(response: request.Response, label: string): void {
    expect(response.status, label).toBe(401);
    expect(response.body, label).toEqual(INVALID_TOKEN_BODY);
    expect(response.headers['www-authenticate'], label).toBe(INVALID_TOKEN_HEADER);
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（できなければ赤にする。読み飛ばさない）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');
    redisClient = client!;
    // 前提: 本番と同じ署名の鍵が読めること
    expect(process.env.JWT_PRIVATE_KEY, 'JWT_PRIVATE_KEY が設定されていない').toBeTruthy();
    signingKey = (await jose.importJWK(
      JSON.parse(Buffer.from(process.env.JWT_PRIVATE_KEY!, 'base64').toString('utf-8')),
      'EdDSA'
    )) as CryptoKey;
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    passwordHash = await hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    await clearRateLimits();
  });

  it('再設定より前のアクセストークンは、状態のキャッシュの TTL を待たずに 2FA の設定・有効化・他の API で署名の不正と同じ 401 になる', async () => {
    const targetEmail = newEmail('target');
    const target = await createUserWithRole(targetEmail, 'user');
    const login = await loginForTokens(app, { email: targetEmail, password: PASSWORD });
    const beforeResetToken: string = login.body.accessToken;
    expect(jose.decodeJwt(beforeResetToken).gen).toBe(0);

    // 登録済みの間に状態をキャッシュへ載せる（TTL 60 秒の間に再設定する）
    const cached = await request(app)
      .get('/api/v1/auth/me')
      .set(...bearer(beforeResetToken));
    expect(cached.status).toBe(200);
    expect(await redisClient.get(authUserStateCacheKey(target.id))).not.toBeNull();

    // 署名を壊したトークンの応答（基準）
    const [header, payload, signature] = beforeResetToken.split('.');
    const tampered = await request(app)
      .post('/api/v1/auth/2fa/setup')
      .set(
        ...bearer(
          `${header}.${payload}.${signature!.startsWith('A') ? 'B' : 'A'}${signature!.slice(1)}`
        )
      );
    expectInvalidTokenResponse(tampered, 'tampered');

    await resetTwoFactor(target.id);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.accessTokenGeneration).toBe(1);
    expect(stored.twoFactorEnabled).toBe(false);

    const requests: Array<[string, () => request.Test]> = [
      ['POST /api/v1/auth/2fa/setup', () => request(app).post('/api/v1/auth/2fa/setup')],
      [
        'POST /api/v1/auth/2fa/enable',
        () => request(app).post('/api/v1/auth/2fa/enable').send({ totpCode: '000000' }),
      ],
      ['GET /api/v1/auth/me', () => request(app).get('/api/v1/auth/me')],
      ['GET /api/projects', () => request(app).get('/api/projects')],
    ];
    for (const [label, send] of requests) {
      const denied = await send().set(...bearer(beforeResetToken));
      expectInvalidTokenResponse(denied, label);
      expect(denied.status, label).toBe(tampered.status);
      expect(denied.body, label).toEqual(tampered.body);
      expect(denied.headers['www-authenticate'], label).toBe(tampered.headers['www-authenticate']);
    }
    // 2FA の秘密鍵は作られていない（残ったトークンで先に登録できない）
    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.twoFactorSecret).toBeNull();
    expect(after.twoFactorPendingSecret).toBeNull();
  });

  it('再設定の直後にログインし直したトークンは世代の照合で拒否されず、2FA 未登録として 2FA の設定だけを許す', async () => {
    const targetEmail = newEmail('relogin');
    const target = await createUserWithRole(targetEmail, 'user');
    const beforeReset = await loginForTokens(app, { email: targetEmail, password: PASSWORD });
    const beforeResetToken: string = beforeReset.body.accessToken;

    await resetTwoFactor(target.id);
    const relogin = await loginForTokens(app, { email: targetEmail, password: PASSWORD });
    const afterResetToken: string = relogin.body.accessToken;
    expect(jose.decodeJwt(afterResetToken).gen).toBe(1);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set(...bearer(afterResetToken));
    expect(me.status).toBe(403);
    expect(me.body.code).toBe('TWO_FACTOR_SETUP_REQUIRED');
    const setup = await request(app)
      .post('/api/v1/auth/2fa/setup')
      .set(...bearer(afterResetToken));
    expect(setup.status).toBe(200);

    // 世代は時刻でなく番号で比べる: 再設定と同じ秒（以前の発行時刻）でも新しい世代のトークンは通り、
    // 再設定より後の発行時刻でも古い世代のトークンは拒否する
    const resetSecond = Number(jose.decodeJwt(beforeResetToken).iat);
    const sameSecondNewGeneration = await signAccessToken(target, {
      gen: 1,
      iatSeconds: resetSecond,
    });
    const sameSecond = await request(app)
      .post('/api/v1/auth/2fa/setup')
      .set(...bearer(sameSecondNewGeneration));
    expect(sameSecond.status).toBe(200);
    const laterOldGeneration = await signAccessToken(target, {
      gen: 0,
      iatSeconds: Math.floor(Date.now() / 1000) + 1,
    });
    expectInvalidTokenResponse(
      await request(app)
        .post('/api/v1/auth/2fa/setup')
        .set(...bearer(laterOldGeneration)),
      'later iat with old generation'
    );
  });

  it('gen を持たない既存のトークンは世代 0 の利用者で通り、再設定の後は 401 になる', async () => {
    const target = await createUserWithRole(newEmail('legacy'), 'user');
    const legacyToken = await signAccessToken(target, {});
    expect(jose.decodeJwt(legacyToken).gen).toBeUndefined();

    const accepted = await request(app)
      .get('/api/v1/auth/me')
      .set(...bearer(legacyToken));
    expect(accepted.status).toBe(200);
    expect(accepted.body.email).toBe(target.email);

    await resetTwoFactor(target.id);
    expectInvalidTokenResponse(
      await request(app)
        .post('/api/v1/auth/2fa/setup')
        .set(...bearer(legacyToken)),
      'legacy token after reset'
    );
  });
});
