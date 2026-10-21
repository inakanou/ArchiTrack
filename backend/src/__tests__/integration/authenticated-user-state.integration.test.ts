/**
 * @fileoverview 利用者の状態の取得・キャッシュ・無効化と、応答に載せる状態の統合検証（タスク47.5）
 *
 * モックを使わず、本物のアプリと実 PostgreSQL・実 Redis（redis.ts の initRedis、REDIS_URL）を通す。
 * Redis に接続できないときは前提の確認で赤くなる（読み飛ばさない）。
 *
 * 確かめること:
 * - `GET /api/v1/auth/me` の状態（2FA の登録・初回のパスワード変更の要否）は状態のキャッシュ
 *   （鍵 `auth:user-state:<userId>`、TTL 60 秒）を経由して読まれ、無効化の後は DB の新しい値になる
 * - 2FA の有効化はコミットの後にキャッシュを無効化し、直後の `/me` が登録済みを返す
 * - ログイン・2FA の検証・リフレッシュ・2FA の有効化・パスワード変更の応答に利用者の状態が載る
 * - 統合テストの生成の部品（47.3）が DB を書いた直後に、状態の取得が新しい値を返す
 * - 認証ミドルウェアの状態の照合もキャッシュを経由する（タスク47.6 で拒否を入れた。初回の変更を要する・
 *   2FA 未登録の利用者の `/me` は 403 になる。拒否そのものの検証は user-state-enforcement の統合検証で行う）
 */

import { randomBytes, randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { authenticator } from 'otplib';
import type Redis from 'ioredis';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { seedRoles } from '../../utils/seed-helpers.js';
import { getSharedAuthenticatedUserStateService } from '../../services/authenticated-user-state.service.js';
import {
  AUTH_USER_STATE_CACHE_TTL_SECONDS,
  authUserStateCacheKey,
  authUserStateGenerationKey,
} from '../../services/authenticated-user-state-cache.js';
import { loginForTokens } from './auth-login-client.js';
import { issuedRefreshToken, refreshWithCookie } from './refresh-cookie-client.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua475-user-state';
const PASSWORD = 'UserState!Passphrase-2026';
const NEW_PASSWORD = 'UserState!Rotated-2026xy';

describe('利用者の状態の取得とキャッシュ・応答の状態（統合）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  let passwordHash: string;
  let email: string;

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

  async function createUser(state: Parameters<typeof createTestUser>[2] = {}) {
    return createTestUser(prisma, { email, displayName: `${MARK}-user`, passwordHash }, state);
  }

  function getMe(accessToken: string): request.Test {
    return request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（できなければ赤にする。読み飛ばさない）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');
    redisClient = client!;
    await seedRoles(prisma);
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
    email = `${MARK}-${randomBytes(4).toString('hex')}@example.com`;
  });

  it('/me の状態はキャッシュを経由して読まれ、無効化の後は DB の新しい値を返す', async () => {
    const user = await createUser();
    const login = await loginForTokens(app, { email, password: PASSWORD });
    const accessToken = login.body.accessToken as string;

    const first = await getMe(accessToken).expect(200);
    expect(first.body).toMatchObject({ twoFactorEnabled: true, mustChangePassword: false });

    // 状態は auth:user-state:<userId> に TTL 60 秒で載る
    const cached = await redisClient.get(authUserStateCacheKey(user.id));
    expect(JSON.parse(cached!)).toEqual({
      isActive: true,
      twoFactorEnabled: true,
      mustChangePassword: false,
    });
    const ttl = await redisClient.ttl(authUserStateCacheKey(user.id));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(AUTH_USER_STATE_CACHE_TTL_SECONDS);

    // 無効化を伴わない DB の直接の変更は、キャッシュの TTL の間は /me に現れない（キャッシュを経由する証拠）
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    const stale = await getMe(accessToken).expect(200);
    expect(stale.body.mustChangePassword).toBe(false);

    // 無効化（消して世代を進める）の直後は DB の新しい値を返す
    const generationBefore = Number(
      (await redisClient.get(authUserStateGenerationKey(user.id))) ?? 0
    );
    await getSharedAuthenticatedUserStateService().invalidate(user.id);
    expect(Number(await redisClient.get(authUserStateGenerationKey(user.id)))).toBe(
      generationBefore + 1
    );
    // 新しい値（初回の変更を要する）で認証ミドルウェアが照合し、/me を拒否する（タスク47.6）
    const fresh = await getMe(accessToken).expect(403);
    expect(fresh.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('生成の部品が DB を書いた直後に、状態の取得が新しい値を返す', async () => {
    const id = randomUUID();
    const service = getSharedAuthenticatedUserStateService();
    await createTestUser(
      prisma,
      { id, email, displayName: `${MARK}-user`, passwordHash },
      { mustChangePassword: false }
    );
    expect(await service.getState(id)).toMatchObject({ mustChangePassword: false });
    expect(await redisClient.get(authUserStateCacheKey(id))).not.toBeNull();

    // 同じ ID の利用者を作り直す（削除は無効化を伴わない）
    await prisma.user.delete({ where: { id } });
    await createTestUser(
      prisma,
      { id, email, displayName: `${MARK}-user`, passwordHash },
      { mustChangePassword: true, twoFactor: false }
    );

    expect(await service.getState(id)).toEqual({
      isActive: true,
      twoFactorEnabled: false,
      mustChangePassword: true,
    });
  });

  it('2FA の有効化はキャッシュを無効化し、応答と直後の /me が登録済みの状態を返す', async () => {
    await createUser({ twoFactor: false });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    const accessToken = login.body.accessToken as string;

    // 2FA 未登録の間は /me も拒否される（要件34.2、タスク47.6）
    const before = await getMe(accessToken).expect(403);
    expect(before.body.code).toBe('TWO_FACTOR_SETUP_REQUIRED');

    const setup = await request(app)
      .post('/api/v1/auth/2fa/setup')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const enabled = await request(app)
      .post('/api/v1/auth/2fa/enable')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ totpCode: authenticator.generate(setup.body.secret as string) });

    expect(enabled.status).toBe(200);
    expect(enabled.body.backupCodes).toHaveLength(10);
    expect(enabled.body.user).toMatchObject({
      email,
      twoFactorEnabled: true,
      mustChangePassword: false,
    });
    const after = await getMe(accessToken).expect(200);
    expect(after.body.twoFactorEnabled).toBe(true);
  });

  it('ログイン（2FA 未登録）・2FA の検証・リフレッシュ・パスワード変更の応答に利用者の状態が載る', async () => {
    // 2FA 未登録・初回の変更を要する利用者のログインはトークンを返し、状態を載せる
    await createUser({ twoFactor: false, mustChangePassword: true });
    const plain = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(plain.status).toBe(200);
    expect(plain.body.user).toMatchObject({ twoFactorEnabled: false, mustChangePassword: true });
    // 画面は応答の状態で遷移を制限する。/me は状態の照合で拒否される（タスク47.6）
    const me = await getMe(plain.body.accessToken as string).expect(403);
    expect(me.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // 2FA 登録済みの利用者の 2FA の検証の応答
    await cleanup();
    await createUser({ mustChangePassword: true });
    const verified = await loginForTokens(app, { email, password: PASSWORD });
    expect(verified.body.user).toMatchObject({ twoFactorEnabled: true, mustChangePassword: true });

    // リフレッシュの応答
    const refreshed = await refreshWithCookie(app, issuedRefreshToken(verified));
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user).toMatchObject({ twoFactorEnabled: true, mustChangePassword: true });

    // パスワード変更の応答
    const changed = await request(app)
      .post('/api/v1/auth/password/change')
      .set('Authorization', `Bearer ${refreshed.body.accessToken as string}`)
      .send({
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        newPasswordConfirm: NEW_PASSWORD,
      });
    expect(changed.status).toBe(200);
    // パスワード変更の完了で初回の変更の要否が解ける（要件37.7、タスク47.6）
    expect(changed.body).toMatchObject({
      message: 'Password changed successfully',
      user: { email, twoFactorEnabled: true, mustChangePassword: false },
    });
  });
});
