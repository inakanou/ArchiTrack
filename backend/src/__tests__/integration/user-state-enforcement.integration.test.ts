/**
 * @fileoverview 利用者の状態による API の拒否の統合検証（user-authentication タスク47.6）
 *
 * モックを使わず、本物のアプリ（認証ミドルウェア・ルート・エラーハンドラー）と実 PostgreSQL・実 Redis を通す。
 * design.md「利用者の状態の照合」の表に従う。
 * - 2FA 未登録（TwoFactorSetupRequired）: 2FA の設定・有効化・ログアウト以外を 403 `TWO_FACTOR_SETUP_REQUIRED`
 *   （`GET /api/v1/auth/me` も拒否する。要件34.2）
 * - 初回のパスワード変更中（PasswordChangeRequired）: パスワード変更・ログアウト以外を 403
 *   `PASSWORD_CHANGE_REQUIRED`。変更の完了で要否が解け、TTL を待たずに 2FA 未登録の制限へ移る（要件37.7）
 * - 無効化（Deactivated）: API・リフレッシュを 401 `ACCOUNT_DISABLED`（要件36.1）
 * - 削除: 削除の直後のアクセストークンを状態のキャッシュの TTL を待たずに 401 にする
 */

import { randomBytes } from 'crypto';
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
import tokenService from '../../services/token.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';
import { getSharedAuthenticatedUserStateService } from '../../services/authenticated-user-state.service.js';
import { authUserStateCacheKey } from '../../services/authenticated-user-state-cache.js';
import { loginForTokens } from './auth-login-client.js';
import { issuedRefreshToken, refreshWithCookie } from './refresh-cookie-client.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua476-user-state-enforce';
const PASSWORD = 'StateEnforce!Passphrase-2026';
const NEW_PASSWORD = 'StateEnforce!Rotated-2026xy';

describe('利用者の状態による API の拒否（統合）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  let passwordHash: string;

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

  /** ロールを割り当てた利用者を作る */
  async function createUserWithRole(
    email: string,
    roleName: 'admin' | 'user',
    state: Parameters<typeof createTestUser>[2] = {}
  ) {
    const user = await createTestUser(
      prisma,
      { email, displayName: `${MARK}-user`, passwordHash },
      state
    );
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user;
  }

  /** 2FA 未登録の利用者のログイン（応答がトークンを返す） */
  async function loginWithoutTwoFactor(email: string): Promise<request.Response> {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.requires2FA).toBeUndefined();
    return response;
  }

  function bearer(accessToken: string): [string, string] {
    return ['Authorization', `Bearer ${accessToken}`];
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

  /**
   * @requirement user-authentication/REQ-34.2
   */
  it('2FA 未登録の利用者は /me・業務の API・パスワード変更を 403 で拒否され、2FA の設定とログアウトだけを行える', async () => {
    const email = newEmail('no2fa');
    await createUserWithRole(email, 'user', { twoFactor: false });
    const login = await loginWithoutTwoFactor(email);
    const accessToken = login.body.accessToken as string;

    for (const [method, path] of [
      ['get', '/api/v1/auth/me'],
      ['get', '/api/projects'],
      ['get', '/api/v1/auth/sessions'],
      ['post', '/api/v1/auth/password/change'],
    ] as const) {
      const denied = await request(app)
        [method](path)
        .set(...bearer(accessToken))
        .send(
          method === 'post'
            ? {
                currentPassword: PASSWORD,
                newPassword: NEW_PASSWORD,
                newPasswordConfirm: NEW_PASSWORD,
              }
            : undefined
        );
      expect(denied.status, `${method.toUpperCase()} ${path}`).toBe(403);
      expect(denied.body.code, `${method.toUpperCase()} ${path}`).toBe('TWO_FACTOR_SETUP_REQUIRED');
    }

    // 2FA の設定・有効化は許す。有効化の直後（キャッシュの TTL を待たずに）制限が解ける
    const setup = await request(app)
      .post('/api/v1/auth/2fa/setup')
      .set(...bearer(accessToken));
    expect(setup.status).toBe(200);
    const enabled = await request(app)
      .post('/api/v1/auth/2fa/enable')
      .set(...bearer(accessToken))
      .send({ totpCode: authenticator.generate(setup.body.secret as string) });
    expect(enabled.status).toBe(200);
    expect(enabled.body.user).toMatchObject({ twoFactorEnabled: true });

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set(...bearer(accessToken));
    expect(me.status).toBe(200);
    const projects = await request(app)
      .get('/api/projects')
      .set(...bearer(accessToken));
    expect(projects.status).not.toBe(403);
  });

  /**
   * @requirement user-authentication/REQ-34.2
   */
  it('2FA 未登録の利用者もログアウトはできる', async () => {
    const email = newEmail('no2fa-logout');
    await createUserWithRole(email, 'user', { twoFactor: false });
    const login = await loginWithoutTwoFactor(email);

    const logoutAll = await request(app)
      .post('/api/v1/auth/logout-all')
      .set(...bearer(login.body.accessToken as string));

    expect(logoutAll.status).toBe(200);
  });

  /**
   * @requirement user-authentication/REQ-37.7
   * @requirement user-authentication/REQ-34.2
   */
  it('初回のパスワード変更中の利用者はパスワード変更だけを行え、変更の完了で要否が解けて 2FA 未登録の制限へ移る', async () => {
    const email = newEmail('initial');
    const user = await createUserWithRole(email, 'admin', {
      twoFactor: false,
      mustChangePassword: true,
    });
    const login = await loginWithoutTwoFactor(email);
    expect(login.body.user).toMatchObject({ twoFactorEnabled: false, mustChangePassword: true });
    const accessToken = login.body.accessToken as string;

    // 2FA の設定も許さない（先にパスワードを変える。要件34.2 の例外は初回のパスワード変更に限る）
    for (const [method, path] of [
      ['get', '/api/v1/auth/me'],
      ['get', '/api/v1/users'],
      ['post', '/api/v1/auth/2fa/setup'],
    ] as const) {
      const denied = await request(app)
        [method](path)
        .set(...bearer(accessToken));
      expect(denied.status, `${method.toUpperCase()} ${path}`).toBe(403);
      expect(denied.body.code, `${method.toUpperCase()} ${path}`).toBe('PASSWORD_CHANGE_REQUIRED');
    }

    const changed = await request(app)
      .post('/api/v1/auth/password/change')
      .set(...bearer(accessToken))
      .send({
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        newPasswordConfirm: NEW_PASSWORD,
      });
    expect(changed.status).toBe(200);
    expect(changed.body.user).toMatchObject({ mustChangePassword: false, twoFactorEnabled: false });

    // 要否は DB で解け、全てのリフレッシュトークンが失効している（要件7.5）
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.mustChangePassword).toBe(false);
    const refresh = await refreshWithCookie(app, issuedRefreshToken(login));
    expect(refresh.status).toBe(401);

    // 状態のキャッシュは無効化され、TTL を待たずに 2FA 未登録の制限へ移る
    const after = await request(app)
      .get('/api/v1/auth/me')
      .set(...bearer(accessToken));
    expect(after.status).toBe(403);
    expect(after.body.code).toBe('TWO_FACTOR_SETUP_REQUIRED');

    // 新しいパスワードで再びログインできる（2FA 未登録のためトークンを返す。要件34.1 は画面が遷移させる）
    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: NEW_PASSWORD });
    expect(relogin.status).toBe(200);
    expect(relogin.body.user).toMatchObject({ twoFactorEnabled: false, mustChangePassword: false });
  });

  /**
   * @requirement user-authentication/REQ-36.1
   */
  it('無効化された利用者の API とリフレッシュを 401 ACCOUNT_DISABLED で拒否する（キャッシュの無効化の直後）', async () => {
    const email = newEmail('deactivated');
    const user = await createUserWithRole(email, 'user');
    const login = await loginForTokens(app, { email, password: PASSWORD });
    const accessToken = login.body.accessToken as string;
    // 有効な間は通る（状態がキャッシュに載る）
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set(...bearer(accessToken))
      ).status
    ).toBe(200);

    // 無効化の操作（49.2）の代わりに DB を書き、状態を変える処理と同じくコミットの後に無効化する
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false, deactivatedAt: new Date(), deactivationReason: '検証' },
    });
    await getSharedAuthenticatedUserStateService().invalidate(user.id);

    for (const path of ['/api/v1/auth/me', '/api/projects']) {
      const denied = await request(app)
        .get(path)
        .set(...bearer(accessToken));
      expect(denied.status, path).toBe(401);
      expect(denied.body.code, path).toBe('ACCOUNT_DISABLED');
    }
    const logout = await request(app)
      .post('/api/v1/auth/logout-all')
      .set(...bearer(accessToken));
    expect(logout.status).toBe(401);

    // リフレッシュも拒否し、後継のトークンを作らない
    const tokensBefore = await prisma.refreshToken.count({ where: { userId: user.id } });
    const refresh = await refreshWithCookie(app, issuedRefreshToken(login));
    expect(refresh.status).toBe(401);
    expect(refresh.body.code).toBe('ACCOUNT_DISABLED');
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(tokensBefore);
  });

  it('API で削除した利用者のアクセストークンは、状態のキャッシュの TTL を待たずに 401 になる', async () => {
    const adminEmail = newEmail('admin');
    const admin = await createUserWithRole(adminEmail, 'admin');
    const adminToken = await tokenService.generateAccessToken({
      userId: admin.id,
      email: adminEmail,
      roles: ['admin'],
    });
    const targetEmail = newEmail('target');
    const target = await createUserWithRole(targetEmail, 'user');
    const targetToken = await tokenService.generateAccessToken({
      userId: target.id,
      email: targetEmail,
      roles: ['user'],
    });
    // 有効な間に状態をキャッシュへ載せる
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set(...bearer(targetToken))
      ).status
    ).toBe(200);
    expect(await redisClient.get(authUserStateCacheKey(target.id))).not.toBeNull();

    const removed = await request(app)
      .delete(`/api/v1/users/${target.id}`)
      .set(...bearer(adminToken));
    expect(removed.status).toBe(204);

    expect(await redisClient.get(authUserStateCacheKey(target.id))).toBeNull();
    const after = await request(app)
      .get('/api/v1/auth/me')
      .set(...bearer(targetToken));
    expect(after.status).toBe(401);
  });
});
