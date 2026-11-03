/**
 * @fileoverview 管理者による 2FA の再設定と、利用者による再登録の統合検証（user-authentication タスク47.8）
 *
 * モックを使わず、本物のアプリ（認証ミドルウェア・権限の確認・ルート・エラーハンドラー）と実 PostgreSQL・
 * 実 Redis を通す。
 * - 再設定（`POST /api/v1/users/:id/2fa/reset`）: 対象者を 2FA 未登録にし、秘密鍵・バックアップコード・
 *   全リフレッシュトークンを消し、監査に実行者と対象者を残す。再設定より前のアクセストークンは 401 になり
 *   （要件34.7 の改訂、タスク47.11。詳細は two-factor-reset-access-token-generation.integration.test.ts）、
 *   ログインし直した対象者の API は状態のキャッシュの TTL を待たずに 403 `TWO_FACTOR_SETUP_REQUIRED` になる。
 *   自己の再設定は拒否する
 * - 再登録（`POST /api/v1/auth/2fa/reenroll/start`・`/confirm`）: 確認までは既存の秘密鍵でログインでき、
 *   確認の後は新しい秘密鍵だけでログインできる。バックアップコードを作り直し、監査に残す
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
import { authUserStateCacheKey } from '../../services/authenticated-user-state-cache.js';
import { loginForTokens } from './auth-login-client.js';
import { issuedRefreshToken, refreshWithCookie } from './refresh-cookie-client.js';
import { createTestUser, invalidateUserStateCache } from './test-user-factory.js';

const MARK = 'test-47-8-two-factor-reset';
const PASSWORD = 'TwoFactorReset!Passphrase-2026';

describe('管理者による 2FA の再設定と利用者による再登録（統合）', () => {
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

  async function accessTokenFor(
    user: { id: string; email: string },
    role: 'admin' | 'user'
  ): Promise<string> {
    return tokenService.generateAccessToken({
      userId: user.id,
      email: user.email,
      roles: [role],
      accessTokenGeneration: 0,
    });
  }

  function bearer(accessToken: string): [string, string] {
    return ['Authorization', `Bearer ${accessToken}`];
  }

  /**
   * 与えた秘密鍵のコードでログインの 2FA の検証を通せるかを返す（検証の応答の状態）
   *
   * 同じ 30 秒の中の検証が再利用として拒否されないよう、最後に使った時間ステップを戻してから行う。
   */
  async function verifyLoginWith(email: string, secret: string): Promise<number> {
    const user = await prisma.user.update({
      where: { email },
      data: { twoFactorLastUsedStep: null, twoFactorFailures: 0, twoFactorLockedUntil: null },
    });
    await invalidateUserStateCache(user.id);
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.requires2FA).toBe(true);
    const verify = await request(app)
      .post('/api/v1/auth/verify-2fa')
      .send({ challengeToken: login.body.challengeToken, code: authenticator.generate(secret) });
    return verify.status;
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

  describe('管理者による 2FA の再設定', () => {
    /**
     * @requirement user-authentication/REQ-34.7
     * @requirement user-authentication/REQ-34.10
     */
    it('再設定で対象者が 2FA 未登録になり、バックアップコードと全リフレッシュトークンが消え、監査に実行者と対象者が残る', async () => {
      const admin = await createUserWithRole(newEmail('admin'), 'admin');
      const targetEmail = newEmail('target');
      const target = await createUserWithRole(targetEmail, 'user');
      await prisma.twoFactorBackupCode.create({
        data: { userId: target.id, codeHash: await hash('ABCD1234') },
      });
      const login = await loginForTokens(app, { email: targetEmail, password: PASSWORD });
      expect(await prisma.refreshToken.count({ where: { userId: target.id } })).toBeGreaterThan(0);

      const reset = await request(app)
        .post(`/api/v1/users/${target.id}/2fa/reset`)
        .set(...bearer(await accessTokenFor(admin, 'admin')))
        .set('User-Agent', 'two-factor-reset-test');

      expect(reset.status).toBe(204);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(stored.twoFactorEnabled).toBe(false);
      expect(stored.twoFactorSecret).toBeNull();
      expect(stored.twoFactorPendingSecret).toBeNull();
      expect(await prisma.twoFactorBackupCode.count({ where: { userId: target.id } })).toBe(0);
      expect(await prisma.refreshToken.count({ where: { userId: target.id } })).toBe(0);
      const refresh = await refreshWithCookie(app, issuedRefreshToken(login));
      expect(refresh.status).toBe(401);

      const audits = await prisma.auditLog.findMany({
        where: { action: 'TWO_FACTOR_RESET_BY_ADMIN', targetId: target.id },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorId: admin.id,
        actorEmail: admin.email,
        targetType: 'User',
        targetId: target.id,
      });
      expect(audits[0]!.metadata).toMatchObject({
        targetEmail,
        userAgent: 'two-factor-reset-test',
      });
    });

    /**
     * @requirement user-authentication/REQ-34.7
     */
    it('再設定の直後、前のアクセストークンは 401 になり、ログインし直した対象者の API は状態のキャッシュの TTL を待たずに 403 TWO_FACTOR_SETUP_REQUIRED になる', async () => {
      const admin = await createUserWithRole(newEmail('admin'), 'admin');
      const targetEmail = newEmail('target');
      const target = await createUserWithRole(targetEmail, 'user');
      const targetToken = await accessTokenFor(target, 'user');

      // 登録済みの間に状態をキャッシュへ載せる
      const before = await request(app)
        .get('/api/v1/auth/me')
        .set(...bearer(targetToken));
      expect(before.status).toBe(200);
      expect(await redisClient.get(authUserStateCacheKey(target.id))).not.toBeNull();

      const reset = await request(app)
        .post(`/api/v1/users/${target.id}/2fa/reset`)
        .set(...bearer(await accessTokenFor(admin, 'admin')));
      expect(reset.status).toBe(204);

      // 再設定より前のアクセストークンは拒否する（要件34.7。2FA の設定も含む）
      const stale = await request(app)
        .post('/api/v1/auth/2fa/setup')
        .set(...bearer(targetToken));
      expect(stale.status).toBe(401);

      // ログインし直したトークン（2FA 未登録のためログインの応答で発行される）
      const relogin = await loginForTokens(app, { email: targetEmail, password: PASSWORD });
      const reloginToken: string = relogin.body.accessToken;
      for (const path of ['/api/v1/auth/me', '/api/projects']) {
        const denied = await request(app)
          .get(path)
          .set(...bearer(reloginToken));
        expect(denied.status, path).toBe(403);
        expect(denied.body.code, path).toBe('TWO_FACTOR_SETUP_REQUIRED');
      }
      // 2FA の設定はできる（次のログインで設定画面へ進む前提）
      const setup = await request(app)
        .post('/api/v1/auth/2fa/setup')
        .set(...bearer(reloginToken));
      expect(setup.status).toBe(200);
    });

    /**
     * @requirement user-authentication/REQ-34.9
     */
    it('管理者自身の再設定を 403 SELF_RESET_FORBIDDEN で拒否し、状態を変えず監査も残さない', async () => {
      const admin = await createUserWithRole(newEmail('self'), 'admin');

      const reset = await request(app)
        .post(`/api/v1/users/${admin.id}/2fa/reset`)
        .set(...bearer(await accessTokenFor(admin, 'admin')));

      expect(reset.status).toBe(403);
      expect(reset.body.code).toBe('SELF_RESET_FORBIDDEN');
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
      expect(stored.twoFactorEnabled).toBe(true);
      expect(stored.twoFactorSecret).not.toBeNull();
      expect(
        await prisma.auditLog.count({
          where: { action: 'TWO_FACTOR_RESET_BY_ADMIN', targetId: admin.id },
        })
      ).toBe(0);
    });

    it('一般ユーザーの再設定は権限の不足で 403、存在しない対象者は 404 になる', async () => {
      const user = await createUserWithRole(newEmail('general'), 'user');
      const other = await createUserWithRole(newEmail('other'), 'user');
      const admin = await createUserWithRole(newEmail('admin'), 'admin');

      const forbidden = await request(app)
        .post(`/api/v1/users/${other.id}/2fa/reset`)
        .set(...bearer(await accessTokenFor(user, 'user')));
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.code).not.toBe('SELF_RESET_FORBIDDEN');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).twoFactorEnabled
      ).toBe(true);

      const missing = await request(app)
        .post('/api/v1/users/00000000-0000-4000-8000-000000000000/2fa/reset')
        .set(...bearer(await accessTokenFor(admin, 'admin')));
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('利用者による 2FA の再登録', () => {
    /**
     * @requirement user-authentication/REQ-34.11
     */
    it('確認までは既存の秘密鍵が有効で、新しいコードの確認で秘密鍵が置き換わりバックアップコードが作り直され監査に残る', async () => {
      const oldSecret = authenticator.generateSecret();
      const email = newEmail('reenroll');
      const user = await createUserWithRole(email, 'user', { twoFactor: { secret: oldSecret } });
      const oldBackupCode = await prisma.twoFactorBackupCode.create({
        data: { userId: user.id, codeHash: await hash('OLDC0DE1') },
      });
      const accessToken = (await loginForTokens(app, { email, password: PASSWORD })).body
        .accessToken as string;
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorLastUsedStep: null } });

      // 現在のコードの確認の後に新しい秘密鍵を受け取る
      const start = await request(app)
        .post('/api/v1/auth/2fa/reenroll/start')
        .set(...bearer(accessToken))
        .send({ currentCode: authenticator.generate(oldSecret) });
      expect(start.status).toBe(200);
      const newSecret = start.body.secretForManualEntry as string;
      expect(newSecret).toMatch(/^[A-Z2-7]+=*$/);
      expect(newSecret).not.toBe(oldSecret);
      expect(start.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

      // 確認の前: 既存の秘密鍵でログインでき、新しい秘密鍵ではできない
      expect(await verifyLoginWith(email, oldSecret)).toBe(200);
      expect(await verifyLoginWith(email, newSecret)).toBe(401);

      await prisma.user.update({ where: { id: user.id }, data: { twoFactorLastUsedStep: null } });
      const confirm = await request(app)
        .post('/api/v1/auth/2fa/reenroll/confirm')
        .set(...bearer(accessToken))
        .send({ newCode: authenticator.generate(newSecret) });
      expect(confirm.status).toBe(200);
      expect(confirm.body.backupCodes).toHaveLength(10);
      for (const code of confirm.body.backupCodes as string[]) {
        expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      }

      // 確認の後: 新しい秘密鍵でだけログインできる
      expect(await verifyLoginWith(email, newSecret)).toBe(200);
      expect(await verifyLoginWith(email, oldSecret)).toBe(401);

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.twoFactorEnabled).toBe(true);
      expect(stored.twoFactorPendingSecret).toBeNull();
      const codes = await prisma.twoFactorBackupCode.findMany({ where: { userId: user.id } });
      expect(codes).toHaveLength(10);
      expect(codes.map((c) => c.id)).not.toContain(oldBackupCode.id);
      expect(
        await prisma.auditLog.count({
          where: { action: 'TWO_FACTOR_REENROLLED', actorId: user.id, targetId: user.id },
        })
      ).toBe(1);
    });

    /**
     * @requirement user-authentication/REQ-34.11
     */
    it('現在のコードの誤りでは新しい秘密鍵を発行せず、開始していない確認は 400 REENROLLMENT_NOT_STARTED になる', async () => {
      const secret = authenticator.generateSecret();
      const email = newEmail('reenroll-ng');
      const user = await createUserWithRole(email, 'user', { twoFactor: { secret } });
      const accessToken = (await loginForTokens(app, { email, password: PASSWORD })).body
        .accessToken as string;

      const wrongCode = authenticator.generate(authenticator.generateSecret());
      const start = await request(app)
        .post('/api/v1/auth/2fa/reenroll/start')
        .set(...bearer(accessToken))
        .send({ currentCode: wrongCode === authenticator.generate(secret) ? '000000' : wrongCode });
      expect(start.status).toBe(400);
      expect(start.body.code).toBe('INVALID_TOTP_CODE');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).twoFactorPendingSecret
      ).toBeNull();

      const confirm = await request(app)
        .post('/api/v1/auth/2fa/reenroll/confirm')
        .set(...bearer(accessToken))
        .send({ newCode: authenticator.generate(secret) });
      expect(confirm.status).toBe(400);
      expect(confirm.body.code).toBe('REENROLLMENT_NOT_STARTED');
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.twoFactorSecret).not.toBeNull();
      expect(
        await prisma.auditLog.count({
          where: { action: 'TWO_FACTOR_REENROLLED', actorId: user.id },
        })
      ).toBe(0);
    });
  });
});
